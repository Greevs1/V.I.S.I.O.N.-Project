# Phase S4 — Gate A **Revision 4** · Final Correction Delta
## (PROPOSAL ONLY — Gate B NOT authorized)

**Base:** `VISION_SECURITY_S4_SNAPSHOT_AUTHORIZATION_PREFLIGHT.md` (Rev 2) + `VISION_SECURITY_S4_GATE_A_REVISION_3.md` (Rev 3).
**This packet contains only the deltas.** Everything not named here stands as in Rev 3.

**Scope:** no code edited · no SQL run · no migration created · no tests executed · nothing deployed · no financial writes · production Supabase, CB-005A, CB-005B, providers and Digital Twin untouched. No `created_by` UUID guessed; no advisor authority enabled.

---

## 1. Reserved metadata-key validation — check the extracted KEY (Item 1)

**The defect.** Rev 3 tested `v_target = any(v_reserved_meta_keys)`. `v_target` is `'metadata.provenance'`; the list holds `'provenance'`. The comparison could never match, so **the guard was inert** — a contract that ever declared a reserved name would have written straight over the writer's own block.

**Replace** the target check in Rev 3 §3.2 step 5 with a single extraction used for **both** validation and writing, so the two can never disagree:

```sql
    -- Extract the metadata KEY once. `substr(v_target, 10)` is the exact remainder after the
    -- literal 'metadata.'; the same variable performs the write below, so validation and
    -- persistence cannot diverge.
    if left(v_target, 9) = 'metadata.' then
      v_meta_key := substr(v_target, 10);

      if v_meta_key = '' or position('.' in v_meta_key) > 0 then
        raise exception 'SNAPSHOT_INVALID_TARGET' using errcode = '22023';
      end if;

      -- THE CORRECTED GUARD: the KEY is compared to the reserved list, not the full target.
      if v_meta_key = any (v_reserved_meta_keys) then
        raise exception 'SNAPSHOT_RESERVED_METADATA_KEY' using errcode = '22023';
      end if;
    else
      -- Column targets carry no prefix; this full-string test stays as a redundant guard.
      if v_target = any (v_reserved_meta_keys) then
        raise exception 'SNAPSHOT_RESERVED_METADATA_KEY' using errcode = '22023';
      end if;
    end if;
```

and the write becomes:

```sql
    if v_meta_key is not null then
      v_meta_metrics := jsonb_set(v_meta_metrics, array[v_meta_key], to_jsonb(v_value), true);
    else
      v_metrics := jsonb_set(v_metrics, array[v_target], to_jsonb(v_value), true);
    end if;
```

New declaration: `v_meta_key text;` — set to NULL before each loop iteration.

**The allowlist is preserved and remains authoritative.** The caller-facing control is still `SNAPSHOT_TARGET_NOT_IN_CONTRACT` (step 4): an undeclared target is refused before the reserved test runs. The reserved-key test is a **second** layer that protects the *contract's own integrity* — it stops a future contract version from declaring `provenance`, `content_hash`, `basis`, `mapping_contract` or `created_by_base44_user_id` and silently overwriting the writer's block. Layer, not replacement.

**Layer:** Supabase. **Smallest safe correction:** one extraction variable + `position`/emptiness checks.

---

## 2. Snapshot identity and idempotency (Item 2)

### 2.1 The rule

> **Everything stored on the snapshot row must be hashed, and everything hashed must be a variable that is also inserted.** A field that is stored but unhashed lets two rows share a hash while differing in stored content; a field that is hashed but not stored makes the hash claim something the row does not contain.

Rev 3 hashed document, version, type, basis, resolved type and values — but **not** `snapshot_date`, `data_confidence_score`, `profile_id` or the contributing field ids, all of which **are** stored. That gap is closed here.

### 2.2 Explicit definitions

| Change | New snapshot? | Why |
|---|---|---|
| Accepted field **value** changes | **Yes** | Value is stored and hashed |
| **Contributing field ids** change (a different row wins the ordering) | **Yes** | `provenance` is stored; hashed as `sources` |
| **Confidence score** changes (`confidence_score` edited on a source row) | **Yes** | `data_confidence_score` is stored; hashed at the stored precision |
| **Snapshot date** changes (`documents.year` edited, or a null `year` falling back to today) | **Yes** | `snapshot_date` is stored — see §2.5 |
| **Owner profile** changes (`documents.profile_id`) | **Yes** | `profile_id` is stored |
| `mapping_version` changes | **Yes** | Contract change ⇒ new provenance |
| `document_type` changes | **Yes** | Different contract |
| `basis` changes | **Yes** | Semantic label on the row |
| **`snapshot_type`** changes | **Yes** | Stored; part of the row's identity |
| Source **`review_status`** changes `accepted` ↔ `corrected` (value unchanged) | **No** | `review_status` is **not** stored on the snapshot, so stored content is identical |
| Source row moves **out of** accepted/corrected | **Yes** (target disappears) | Values change |
| `isLatest` | **No** — side effect | Not stored as content; applied on both paths (Rev 3 §3.4) |
| `updateDashboard` | **No** — side effect | Same |
| Skipped-field list | **No** | Returned, **not** stored on the row |
| Request time; **which authorized caller submitted it** | **No** | Attribution is stored in `metadata`, never hashed (§2.3) |

### 2.3 Attribution is deliberately outside identity

`metadata.created_by_base44_user_id` is stored but **not** hashed, so two identical submissions by different authorized callers dedupe to one snapshot. Justification: the snapshot is a measurement of the document; who typed the request does not change the measurement. The consequence is stated so it is not a surprise: **the surviving row carries the first writer's attribution**, and the second caller is told so via `deduplicated: true` plus the returned `snapshot_id`. Because content-hash dedupe is enforced inside the per-business lock, *at most one row exists per hash*, so no two rows can diverge in attribution either. **D-14** (below) asks you to confirm this.

### 2.4 Corrected hash — and the guard that it matches the row

```sql
  -- ── SNAPSHOT IDENTITY ────────────────────────────────────────────────────
  -- Every key below is fed by the SAME VARIABLE that the INSERT writes, so the hash and the
  -- stored row cannot drift. `v_confidence_stored` is the rounded value that is inserted;
  -- hashing the unrounded average would make the hash claim a precision the row lacks.
  v_confidence_stored := round(v_confidence, 2);

  v_content_hash := md5(jsonb_build_object(
    'document',        p_source_document_id,
    'profile',         v_doc_profile,
    'mapping_version', p_mapping_version,
    'document_type',   v_doc_type,
    'basis',           p_basis,
    'snapshot_type',   v_snapshot_type,
    'snapshot_date',   v_snapshot_date,
    'confidence',      v_confidence_stored,   -- the stored value, not the raw average
    'values',          v_hash_input,          -- contract-ordered target = value
    'sources',         v_source_input         -- contract-ordered target = [field ids]
  )::text);
```

`sources` is accumulated in the same contract-ordered loop as the fingerprint (Rev 3 §3.2 step 5):

```sql
    v_source_input := v_source_input || jsonb_build_array(
      jsonb_build_object('t', v_target, 'ids', to_jsonb(v_ids)));
```

with `v_source_input jsonb := '[]'::jsonb;` declared alongside `v_hash_input`.

The inserted `data_confidence_score` becomes `v_confidence_stored` (not `round(v_confidence, 2)` inline), so one variable feeds both.

**Runtime tripwire — the hash is checked against the row that was written:**

```sql
  returning id, metadata, snapshot_date, data_confidence_score
    into v_snapshot_id, v_persisted_metadata, v_persisted_date, v_persisted_confidence;

  if v_persisted_date is distinct from v_snapshot_date
     or v_persisted_confidence is distinct from v_confidence_stored
     or v_persisted_metadata is null
     or not (v_persisted_metadata @> v_meta_metrics)
     or (v_persisted_metadata->>'content_hash') is distinct from v_content_hash then
    raise exception 'SNAPSHOT_IDENTITY_LOST' using errcode = '22023';
  end if;
```

This replaces Rev 3's `SNAPSHOT_METADATA_LOST` check with a strictly wider one: the stored date, confidence and hash must all equal the values the hash was computed from.

### 2.5 One consequence to accept deliberately

When `documents.year` is NULL, `snapshot_date` falls back to `current_date` (preserving existing behaviour). The date is now part of identity, so **a replay of such a document on a later day is a different snapshot, not a duplicate.** That is honest — the stored date differs — but it must be a known property, not a discovery: how many documents lack a `year` is on the verification checklist (V-14).

**Layer:** Supabase. **Smallest safe correction:** add the three missing inputs, feed the hash and the INSERT from one variable each, extend the post-insert assertion.

---

## 3. Dashboard promotion policy (Item 3)

### 3.1 The claim that is withdrawn

Revision 2 and 3 stated that update-then-insert is duplicate-safe. **Withdrawn — it was not proven.** Two reasons:

- The advisory lock is taken **only by this function**. Other writers of `dashboard_metrics` (`forceUpdateDashboardMetrics`, `hydrateDashboardFromJourney`, `saveAssessmentToSupabase`, `regenerateCiqMetrics`, `supabaseDashboardData`) do not take it, so it cannot serialize them.
- `dashboard_metrics.business_id` uniqueness is **not verified**. `ux_dashboard_metrics_business_id` is *authored* at `phase_6_9_dashboard_metrics_business_identity.sql:187`, which is evidence of intent, not of deployment. Without a deployed unique index, an insert is a bare insert: a concurrent one creates a second row.

### 3.2 The promotion policy

> **`dashboard_metrics` is a projection of the PROMOTED snapshot, not of any snapshot.** A snapshot writes it only when, after this transaction, that snapshot is the business's latest. An older snapshot replayed later therefore **cannot** silently overwrite newer metrics: it does not touch the dashboard at all unless the caller explicitly promotes it — and if it does, the report says so.

```sql
  -- ── DASHBOARD PROMOTION ──────────────────────────────────────────────────
  -- Capture the previously promoted date BEFORE the demotion, so a promotion that moves the
  -- business's basis BACKWARDS is reported rather than silent.
  select snapshot_date into v_previous_latest_date
    from public.business_metric_snapshots
   where business_id = p_business_id and is_latest and id <> v_snapshot_id
   order by snapshot_date desc limit 1;

  if coalesce(p_update_dashboard, false) then
    if not v_is_latest_now then
      v_dashboard_skip := 'not_latest';            -- the replay case: refused, and reported
    elsif (v_metrics ? 'annual_revenue' or v_metrics ? 'net_profit') then
      update public.dashboard_metrics
         set annual_revenue     = coalesce((v_metrics->>'annual_revenue')::numeric, annual_revenue),
             net_profit         = coalesce((v_metrics->>'net_profit')::numeric, net_profit),
             latest_snapshot_id = v_snapshot_id,
             updated_at         = clock_timestamp()
       where business_id = p_business_id;

      if not found then
        -- INSERT IS DISABLED until V-2 confirms a unique index on dashboard_metrics(business_id).
        -- Once confirmed, this becomes ON CONFLICT (business_id) DO UPDATE, which is race-proof
        -- independently of the advisory lock.
        if v_dashboard_insert_enabled then
          insert into public.dashboard_metrics
            (business_id, annual_revenue, net_profit, latest_snapshot_id, created_at, updated_at)
          values (p_business_id, (v_metrics->>'annual_revenue')::numeric,
                  (v_metrics->>'net_profit')::numeric, v_snapshot_id,
                  clock_timestamp(), clock_timestamp());
        else
          v_dashboard_skip := 'no_row_insert_disabled';
        end if;
      end if;

      if v_dashboard_skip is null then
        v_dashboard_done := true;
        if v_previous_latest_date is not null and v_snapshot_date < v_previous_latest_date then
          v_promoted_over_newer := true;           -- allowed, but never silent
        end if;
      end if;
    else
      v_dashboard_skip := 'no_dashboard_metrics';
    end if;
  end if;
```

Declarations: `v_dashboard_insert_enabled constant boolean := false;` (flipped in one edit once V-2 passes), `v_dashboard_skip text`, `v_promoted_over_newer boolean := false`, `v_previous_latest_date date`.

The return object gains `dashboard_skipped_reason`, `promoted_over_newer` and `is_latest`; the Base44 response surfaces `dashboard_skipped_reason` so a caller is never left guessing why the dashboard did not move.

**Two contingent items:** writing `latest_snapshot_id` assumes that column accepts a `business_metric_snapshots.id` (V-3); if it does not, drop that assignment — the policy holds without it.

**Layer:** Supabase. **Smallest safe correction:** gate the dashboard write on promotion, disable the INSERT path until the constraint is verified, report the skip reason.

---

## 4. Test corrections (Item 4)

**The SQL was right; the test was wrong.** Cardinality `many` means **one or more**, so `sum`/`mean` with a single contributing row is **valid** and must be accepted. Rev 3's T-4 wrongly expected `SNAPSHOT_CARDINALITY_VIOLATION` for it.

**Replace T-4 with:**

| # | Case | Expected |
|---|---|---|
| **T-4a** | `op = 'sum'` on a `direct` target (`annual_revenue`) | `SNAPSHOT_OP_MISMATCH` |
| **T-4b** | `op = 'direct'` with **two** ids | `SNAPSHOT_CARDINALITY_VIOLATION` |
| **T-4c** | **`sum` / `mean` with exactly ONE contributing row** — the corrected case | **Accepted**; value equals that row; snapshot written |
| **T-4d** | `direct` with an **empty** `field_ids` array | `SNAPSHOT_INVALID_TARGET` |
| **T-4e** | **Zero-row rejection (new, separate test):** a `many` target whose ids all fail the predicate — wrong document, wrong business, unreviewed, or wrong `field_name` | `SNAPSHOT_FIELD_NOT_CONTRACTED`; **zero writes** |
| **T-4f** | Zero-row rejection, empty-array variant sent deliberately for a `many` target | `SNAPSHOT_INVALID_TARGET`; zero writes |

T-4e and T-4f are two different mechanisms — a caller that names rows which do not qualify, and a caller that names none — and are asserted separately.

**Layer:** test-only.

---

## 5. D-4 — advisor authority stays OFF (Item 5)

**Decision: the advisor branch is disabled, not merely deferred.** Evidence: the column is the certified pattern (six modules, and `decisionIntelligenceService` explicitly rejects `advisor_assignments`), but **no code in this repository creates or clears it** and **0 of 9 businesses have one assigned** — so assignment creation *and* revocation are both unverified, and the branch has never executed.

```ts
/**
 * D-4 — DISABLED. `business_entities.assigned_advisor_id` is the certified column, but neither
 * assignment creation nor revocation is verified (no writer in this repository; 0 of 9
 * businesses assigned). Until both are evidenced, an `advisor` app_role grants NO snapshot
 * authority. Flipping this constant is the ONLY change needed to re-enable it.
 */
const ADVISOR_AUTHORITY_ENABLED = false;

  if (ADVISOR_AUTHORITY_ENABLED
      && actor.role === 'advisor'
      && entity.assigned_advisor_id === actor.profile_id) {
    return 'assigned_advisor';
  }
```

```sql
  v_advisor_authority_enabled constant boolean := false;
  -- …
    elsif v_advisor_authority_enabled
          and v_role = 'advisor'
          and v_entity.assigned_advisor_id is not null
          and v_entity.assigned_advisor_id = p_actor_profile_id then
      v_authorized := true;
```

**The authorization table loses its advisor row.** Approved policy as now enforced: canonical `admin`/`super_admin`; business owner via `business_entities.profile_id`; business owner via an active `business_owners` record; **everything else denied**. Advisors are denied until V-5 passes.

**Impact today: zero.** No business has an assignment, so no advisor could have exercised the branch. If advisors must author snapshots before V-5 completes, the interim route is an explicit `business_owners` record.

**Layer:** Base44 + Supabase.

---

## 6. D-13 — no `created_by` value is written (Item 6)

**Decision: the column is omitted from the INSERT entirely.** No UUID is guessed, and no attribution behaviour is selected while the FK target, nullability and existing convention are unknown.

```sql
  -- D-13 OPEN — `created_by` is intentionally NOT written.
  -- Unverified: (a) its foreign-key target, (b) whether it is nullable, (c) whether it has a
  -- default, (d) which id space existing values occupy. The Base44 user id cannot go here
  -- (the column is uuid), and passing the canonical profile id would be a guess about a
  -- reference we have not read. Attribution is preserved in
  -- metadata.created_by_base44_user_id — text, unconstrained, no guess required.
  insert into public.business_metric_snapshots (
    profile_id, business_id, snapshot_type, snapshot_date,
    annual_revenue, gross_profit, net_profit, total_expenses, owner_compensation,
    payroll, total_debt, cash_on_hand, total_assets,
    metadata, data_source, source_document_id, data_confidence_score, is_latest
    -- created_by deliberately absent
  )
```

`created_by_base44_user_id` stays in the reserved metadata keys, so the corrected key guard of §1 now **does** protect attribution from a caller-supplied contract target.

**One branch to resolve before Gate B (V-4):** if `created_by` is **NOT NULL with no default**, the insert cannot proceed at all — that is a blocker, and the options (write a profile UUID once the FK target is confirmed, or relax the column) must be chosen explicitly rather than assumed.

**Layer:** Supabase (omission); decision deferred.

---

## 7. Profile status: what `incomplete` means, and the conservative policy (Item 7)

### 7.1 Business meaning

`profiles.profile_status` is the **account lifecycle** field. `incomplete` is the **onboarding default**: a profile exists and a real person owns it, but onboarding has not been marked finished. This is documented in the platform's own authorization module, which states that `incomplete` is the default production legitimately uses for owners and admins and that *only an explicit suspension revokes standing* (`shared/authz/actor.ts`). Observationally it is not an edge case — **7 of 8 profiles are `incomplete`** (V-1).

### 7.2 Should `incomplete` be eligible for authoritative financial writes?

**As a floor, yes. As a grant, never.** These are different roles:

- **Status is a floor** — it can only *remove* eligibility (suspension must never write financials).
- **Relationship is the grant** — eligibility is conferred solely by a verified ownership or assignment relationship to *that* business.

So the conservative policy is: **`profile_status ∈ {active, incomplete}` AND a verified relationship.** A profile that is `incomplete` *and* unrelated to the business gets nothing, because the relationship test has already failed. The status test adds safety (it excludes suspended, deactivated and unknown states); it is not what authorizes.

### 7.3 The two candidate policies, and who they affect

| Policy | Eligible today | Effect on legitimate owners |
|---|---|---|
| `{active}` only | **1 of 8 profiles** | **Excludes 7 of 8, including every owner on `incomplete`.** Snapshot creation becomes effectively unavailable until owners are individually marked `active` — a product change, not a security fix |
| **`{active, incomplete}` + verified relationship** *(recommended)* | **8 of 8, each still only for its own business** | No legitimate owner is excluded; an unrelated profile is still refused |

**Recommendation:** adopt `{active, incomplete}` with the relationship requirement, and keep the allowlist as a **single named constant** in both layers so it can be tightened in one edit.

**The condition that would flip this:** if verification shows `incomplete` is also used for **de-provisioned or abandoned** accounts, tighten to `{active}` and accept the reduced eligibility. That is exactly what V-1 resolves.

**Residual risk while unverified:** if an `incomplete` profile names a business it legitimately owns, it may author snapshots for that business. The relationship is the control; the status is not.

**Layer:** Base44 + Supabase (allowlist), verification (checklist).

---

## 8. Remaining verification checklist

Read-only. Every item is required **before Gate B**, and each names the decision it unblocks. The Supabase connector carries `database:read`, which appears sufficient — to be confirmed.

| # | Verify | Method | Unblocks |
|---|---|---|---|
| **V-1** | **Declared** `profiles.profile_status` vocabulary — including any check constraint, and whether `incomplete` can mean de-provisioned | `pg_constraint` on `profiles` (`contype='c'`); confirm with the product owner | §7 policy; D-7 family |
| **V-2** | `dashboard_metrics(business_id)` **uniqueness** deployed, and zero duplicate rows exist | `pg_indexes` / `pg_constraint` for `ux_dashboard_metrics_business_id`; `group by business_id having count(*)>1` | Whether the dashboard INSERT path may be enabled; the duplicate-safety question in §3 |
| **V-3** | `dashboard_metrics.latest_snapshot_id` — presence, type, FK target, nullability | `information_schema.columns` + `pg_constraint` | Whether §3.2 may record the promotion basis |
| **V-4** | `business_metric_snapshots.created_by` — FK target, nullability, default, existing value convention | `pg_constraint` / `pg_depend` + a sample of non-null values | **D-13**; whether the insert can proceed at all |
| **V-5** | `assigned_advisor_id` — who **creates** and who **clears** it; whether clearing is the revocation path; any stale assignment pointing at a non-active profile | Code + operational owner; then a join probe | **D-4**; re-enabling advisor authority |
| **V-6** | At most one `is_latest` row per business | `group by business_id having count(*)>1` | Whether §9.5's partial unique index can be added |
| **V-7** | `count(*)` on `business_metric_snapshots` | Simple count | Whether this path ever produced a row — the empirical confirmation of F-1/F-6 |
| **V-8** | `business_owners.end_date` semantics (`NULL`/future = active) | Sample rows + the owner-writing flow | The active-ownership predicate |
| **V-9** | `business_metric_snapshots.net_margin` unit (ratio vs percentage) | Sample non-null values | **D-11** (margin writes) |
| **V-10** | `service_role` privileges on the three tables | `information_schema.role_table_grants` | Whether the RPC can perform its writes at all |
| **V-11** | No existing function named `create_reviewed_fields_snapshot` or `s4_mapping_contract` | `pg_proc` | Migration safety |
| **V-12** | The full set of writers of `dashboard_metrics` (the advisory lock does not serialize them) | Code search + deploy-time review | §3.1's withdrawn claim — no write path may assume the lock protects it |
| **V-13** | `extracted_fields.reviewed_at` — who sets it; whether it is NULL in practice | `count(*) filter (where reviewed_at is null)` + the review writer | Whether §2.2's ordering rule behaves as intended on real data |
| **V-14** | How many `documents` have a NULL `year` (snapshot-date fallback ⇒ date becomes identity) | Count | The replay behaviour described in §2.5 |
| **V-15** | `business_entities.assigned_advisor_id` still unused by any snapshot path after V-5 | Re-check the branch stays disabled | Confirms §5 holds |

---

## 9. Unchanged

D-1 (404 conflation), D-2 (team/expert denied), D-3 (typed columns), D-5 (withdrawn prefix matching), D-6 (server timestamps), D-7 (409 fail-closed), D-8 (`total_liabilities` in metadata), D-10 (`mean_interest_rate`), D-11 (no margin until V-9), D-12 (optional indexes deferred) — all preserved as approved. The trust-boundary statement, the financial mapping audit, source integrity, contract enforcement, the `REVOKE`-then-`GRANT` block, the rollback order and the Rev 2/Rev 3 test plans stand, subject only to the test correction in §4.

**Conditional, awaiting your ruling:** **D-4** (disabled per §5), **D-9** (idempotency — now fully specified in §2), **D-13** (no `created_by` value per §6), **D-14 (new)** — content-identity excludes the caller, so identical submissions by two authorized users dedupe to the first writer's row, which retains that writer's attribution and is reported as a duplicate.

---

## 10. Gate status

**Gate A, Revision 4:** review §1 (key guard), §2 (identity), §3 (promotion policy + withdrawn claim), §4 (tests), §5 (D-4 off), §6 (D-13), §7 (status policy) and §8 (checklist). **Nothing applied.**

**Gate B remains unauthorized.** It opens only when §8's items are answered and D-4, D-9, D-13 and D-14 are ruled on.

**Awaiting:** approval of §1–§7, and your rulings on D-4, D-9, D-13 and D-14.