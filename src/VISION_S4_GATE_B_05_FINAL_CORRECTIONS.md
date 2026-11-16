# Phase S4 Gate B · Final Consolidated Corrections
## **INTEGRATED** — folded into the four consolidated documents, which now govern · **Gate B NOT AUTHORIZED**

**Status:** this file is retained as the **change record** only. Every correction below (C-1 … C-7) plus the three final corrections in §9 have been applied to `VISION_S4_GATE_B_01_BASE44_SPEC.md`, `…_02_SQL_MIGRATION.md`, `…_03_TEST_PLAN.md` and `…_04_PRECHECK_AND_CONSISTENCY.md`. Those four documents are internally consistent and are the authoritative text; this file no longer governs in case of divergence. Nothing was implemented, executed, deployed or changed in any environment — the edits are documentation only.

**Supersedes, for the items below only,** the corresponding text in the four consolidated Gate B documents (`01_BASE44_SPEC`, `02_SQL_MIGRATION`, `03_TEST_PLAN`, `04_PRECHECK_AND_CONSISTENCY`). Where this file and those disagree on a corrected item, **this file governs**. Every other section of those four documents stands unchanged.

**Scope discipline:** seven corrections only. No new audit, no unrelated section rewritten, no scope expansion. The four source documents were **not** edited — they remain exactly as retrieved for independent review; this is the delta against them.

---

## 0. Preserved unchanged (verified still true after these corrections)

| Preserved | Where it lives | Touched by this file? |
|---|---|---|
| Strict identity binding — exactly one `profiles.base44_user_id` binding; no email fallback on this path | D1 `assertCanonicalActorIdentity` | **No** |
| Required reporting year, no `CURRENT_DATE` fallback | D1 step 3b · D2 §3 step 3 | **No** |
| All-or-nothing confidence over a validated 0–100 scale | D2 §3 step 7 | **No** |
| Advisor authorization disabled in both layers | D1 `ADVISOR_AUTHORITY_ENABLED` · D2 `v_advisor_authority_enabled` | **No** |
| Dashboard projection disabled in both layers | D1 `DASHBOARD_PROJECTION_ENABLED` · D2 `v_dashboard_projection_enabled` | **No** |
| Append-only submission audit, written on both paths | D2 §2, §3 step 13 | **No** (assertions strengthened only — §7) |
| Service-role-only RPC execution | D2 §1, §3 access control | **No** |

No correction below broadens authorization, weakens a guard, or changes the migration's object set.

---

## 1. Correction 1 — the `applied` response mapping (a real, user-visible defect)

### 1.1 The defect

D2 §3 returns `applied` as a **JSON object**: `'applied', v_metrics || v_meta_metrics`. D1 §3 then does:

```ts
const mapped = Array.isArray(result?.applied)
  ? Object.keys(result.applied).map((k) => ({ field: k, mapped_to: k }))
  : [];
```

`Array.isArray(...)` is **false for an object**, so `mapped` is *always* `[]`. Two consequences, both live:

- `fields_mapped` is empty on **every** successful call, including one that mapped five fields.
- The success message reads `Snapshot created with 0 fields.` (or `… successfully with 0 fields.`), because it is built from `mapped.length`.

This is not a test-expectation problem. It is a defect in the proposed endpoint.

### 1.2 Exact proposed change — D1 §3, replace the mapping block

**Find:** the `const mapped = …` / `mapped`-building block immediately after the `rpcError` guard.

**Replace with:**

```ts
    // `applied` is a JSON OBJECT from the database (`v_metrics || v_meta_metrics`), never an array.
    // `Array.isArray` on it is always false — asserting that shape silently produced an empty
    // `fields_mapped` and a "0 fields" message on every successful call.
    const applied = (result?.applied && typeof result.applied === 'object' && !Array.isArray(result.applied))
      ? (result.applied as Record<string, unknown>)
      : null;

    // The database merges the metric columns and the metadata targets into ONE flat object, so a
    // metadata target arrives as its BARE key (`total_equity`, not `metadata.total_equity`). The
    // contract mirror already distinguishes the two, and contract parity is asserted by T-301, so
    // the destination is reported accurately rather than flattened.
    const metadataTargets = new Set(
      contract.targets
        .filter((t) => t.target.startsWith('metadata.'))
        .map((t) => t.target.slice('metadata.'.length)),
    );

    const mapped = applied
      ? Object.keys(applied).map((k) => ({
          field: k,
          mapped_to: metadataTargets.has(k) ? `metadata.${k}` : k,
        }))
      : [];

    const skippedApplied = Array.isArray(result?.skipped) ? result.skipped : skipped;
```

### 1.3 Exact proposed change — the success message (same defect, same lines)

On a deduplicated submission the current wording claims a snapshot was created when the database created nothing. Resolved here rather than left contradictory with `deduplicated: true`:

**Find:** the `message:` property in the success `Response.json({ … })`.

**Replace with:**

```ts
      message: result?.deduplicated === true
        ? `Snapshot already existed with ${mapped.length} fields; this submission was recorded.`
        : skippedApplied.length > 0
          ? `Snapshot created with ${mapped.length} fields. ${skippedApplied.length} fields skipped (partial snapshot).`
          : `Snapshot created successfully with ${mapped.length} fields.`,
```

### 1.4 Exact proposed change — `fields_skipped` (found under Correction 7, applied here because it is the same response block)

The SQL's `skipped` elements are `{ field_id, reason }` (D1 builds them; D2 echoes them back). The current mapping collapses both to the reason:

```ts
fields_skipped: skippedApplied.map((s: any) => ({ field: s.reason, reason: s.reason })),
```

**Replace with:**

```ts
      fields_skipped: skippedApplied.map((s: any) => ({
        field_id: s?.field_id ?? null,
        reason: s?.reason ?? null,
      })),
```

**Consumer check (verified by search, not assumed):** exactly one caller exists in the repository — `src/components/admin/ExtractedFieldsReviewQueue.jsx:583` — and its snapshot mutation reads only `result.message` (`createSnapshotMutation.onSuccess` → `toast.success(result.message || …)`). A repository-wide search for `fields_mapped` and `fields_skipped` returns **no reference outside the function itself**, so neither key has a consumer and renaming `field` → `field_id` cannot break a caller.

### 1.5 New regression test (requested)

**T-811 — successful snapshot with multiple mapped fields (Group H).**
Fixture: a **balance sheet** with all five targets accepted and scored (`total_assets`, `cash_on_hand`, `total_debt`, `total_equity`, `total_liabilities`), plus one accepted field that feeds no target (e.g. `notes`).

| Assertion | Expected |
|---|---|
| `fields_mapped` is non-empty | Exactly **5** entries |
| `fields_mapped` key set | `{total_assets, cash_on_hand, total_debt, metadata.total_equity, metadata.total_liabilities}` — **metadata targets reported with their `metadata.` prefix** |
| `applied` key set in the SQL return | `{total_assets, cash_on_hand, total_debt, total_equity, total_liabilities}` — **bare** keys, merged. The endpoint's `mapped_to` is the only place the prefix exists |
| `message` | `Snapshot created successfully with 5 fields.` |
| `fields_skipped` | Exactly 1 entry: the unconsumed field's **`field_id`** and a `reason` — not the reason in both slots |
| `success` | `true` |

---

## 2. Correction 2 — administrator authorization, verified against the resolver

### 2.1 What was actually read

`base44/shared/authz/actor.ts` (`authenticateActor`), not a summary:

```ts
export const ADMIN_ROLES = ['admin', 'super_admin'];          // line 46 — the ONE list platform-wide
…
  const appRole = profile?.app_role || null;                  // line 126
…
    role: appRole || 'user',                                  // line 136
    isAdmin: ADMIN_ROLES.includes(appRole),                   // line 137
    isSuperAdmin: appRole === 'super_admin',                  // line 138
```

And the documented rule, lines 82–88 and 128–131: *"Base44 authentication establishes WHO the caller is. It never grants VISION administrative standing. Standing is derived from `profiles.app_role` ALONE … the authenticated Base44 role is deliberately not consulted … A missing canonical profile resolves to 'user' with no standing (fail closed)."*

### 2.2 Ruling

**`actor.isAdmin` IS guaranteed to mean the canonical profile's `app_role` is exactly `admin` or `super_admin`.** Established from source, not inferred. Therefore:

- **D1 §3 `assertSnapshotAuthority` requires no change.** `if (actor.isAdmin) return 'platform_admin';` is already the canonical-role decision, expressed through the one shared list.
- **No broadening, and no second role list.** Declaring a local `['admin','super_admin']` in D1 would duplicate the platform's single list that P3 deliberately exported for exactly this purpose.
- **The SQL layer already agrees:** D2 §3 step 4 derives `v_is_admin := v_role in ('admin','super_admin')` from the same `profiles.app_role`. Both layers read one authority input; they cannot diverge on membership.

### 2.3 The one thing that makes `isAdmin` trustworthy here (recorded, no change)

`authenticateActor` **does** fall back to an email match when `base44_user_id` is unpopulated (lines 105–112). Taken alone, `isAdmin` would inherit that fallback. It does not, on this path, because D1 runs `assertCanonicalActorIdentity` immediately after and requires the resolver's profile to be **the single id-bound profile** — so a profile reached only by email, including an administrative one, is refused before any authority decision is made. The strict binding is what makes `isAdmin` sound; neither guard is sufficient without the other. `assertActiveProfile` likewise reads `actor.profile.profile_status`, which is that same id-bound row.

### 2.4 Test expectation

**T-210** (platform admin → allowed, `platform_admin`) stands unchanged. Add the negative companion so the rule is proven, not assumed:

**T-210b — canonical-only admin standing.** Fixture: a Base44 user whose **Base44** `user.role` is `admin`/`super_admin` but whose canonical `profiles.app_role` is `user`. Expected: **404** — no VISION administrative standing is granted by the Base44 role.

---

## 3. Correction 3 — T-306 (cardinality applies to `direct` only)

### 3.1 The actual rule

D2 §3 step 6:

```sql
    if v_spec->>'cardinality' = 'one' and v_requested <> 1 then
      raise exception 'SNAPSHOT_CARDINALITY_VIOLATION' using errcode = '22023';
    end if;
```

Only `cardinality = 'one'` is constrained, and in `s4.mapping.v1` those are exactly the `direct` targets. Every `sum`/`mean` target is `cardinality: 'many'` and carries **no count constraint**, so a single contributor is valid. The old expectation — "`sum` with one id → cardinality violation" — was wrong, and wrong in a way that matters: it would have rejected a debt schedule with one loan, which is a legitimate document.

Note also the order: an **empty** `field_ids` array is caught *before* the cardinality test (`v_requested is null` → `SNAPSHOT_INVALID_TARGET`), so zero contributors never produce a cardinality error.

### 3.2 Corrected T-306

| Fixture | Expected |
|---|---|
| Wrong `op` for a declared target (e.g. `direct` supplied for a `sum` target) | `SNAPSHOT_OP_MISMATCH` |
| `direct` target with **two** ids | `SNAPSHOT_CARDINALITY_VIOLATION` |
| `direct` target with **empty** `field_ids` | `SNAPSHOT_INVALID_TARGET` (precedes the cardinality test) |
| **`sum` target with one id** | **ALLOWED** — the value equals that single contributor's value |
| **`mean` target with one id** | **ALLOWED** — the mean of one |
| `sum` / `mean` with three ids | ALLOWED — aggregated as declared |
| Any `many` target at any contributor count | No cardinality error is possible |

Zero writes are asserted on every refusal row.

---

## 4. Correction 4 — T-304 (contract-validation precedence)

### 4.1 The actual precedence

D2 §3 validates in this order:

1. **step 5** — `SNAPSHOT_MAPPING_VERSION_UNSUPPORTED`, `SNAPSHOT_DOCUMENT_TYPE_UNSUPPORTED`, `SNAPSHOT_BASIS_MISMATCH`, `SNAPSHOT_DUPLICATE_TARGET`, then **`SNAPSHOT_TARGET_NOT_IN_CONTRACT`** for any `field_map` entry whose target is not declared.
2. **step 6** — the loop over **declared contract targets** only, where `SNAPSHOT_RESERVED_METADATA_KEY` is evaluated.

Because step 5 rejects an undeclared target before step 6 can see it, and step 6 iterates only targets the contract itself declares, **no caller input can reach the reserved-metadata arm**. `metadata.provenance` is not a declared target, so it is always `SNAPSHOT_TARGET_NOT_IN_CONTRACT`. The same holds for a bare `basis`, `content_hash`, `mapping_contract` or `created_by_base44_user_id`.

The reserved-key check is therefore **defence in depth against the contract**, not against the caller: it fires only if a future contract version declares a writer-owned key.

### 4.2 Corrected T-304

| Fixture | Expected |
|---|---|
| `metadata.provenance` supplied as a target | `SNAPSHOT_TARGET_NOT_IN_CONTRACT` — **never** `SNAPSHOT_RESERVED_METADATA_KEY` |
| `basis` / `content_hash` / `mapping_contract` / `created_by_base44_user_id` supplied as targets | The same code, for the same reason |
| Any undeclared target | `SNAPSHOT_TARGET_NOT_IN_CONTRACT`, always resolved at step 5 |

### 4.3 Companion static test (makes the arm's inertness provable)

**T-313 — reserved-key inertness (Group C).** For every defined version of `s4_mapping_contract`, assert that the set of **declared target suffixes** (the part after `metadata.`) and the set of **declared bare targets** are each disjoint from `v_reserved_meta_keys`. Expected: empty intersection in both cases, so the reserved arm is unreachable by construction and the step-5 verdict above is exhaustive.

---

## 5. Correction 5 — T-207/T-208 restored; unique IDs for the claimed-actor cases

### 5.1 Group B keeps its meanings (unchanged)

- **T-207** — a **denied** existing document and a **nonexistent** id produce byte-identical 404s. Group B, authorization/non-disclosure. **Unchanged.**
- **T-208** — an **authority lookup failure** returns 500 with a generic body, logged, zero writes, no fall-through. Group B, failure semantics. **Unchanged.**

The Revision-5 mapping table's row `T-N47 → T-207 + T-208` mis-assigned claimed-actor cases to these two IDs. That row is corrected (§5.3), and the claimed-actor cases get their own group.

### 5.2 New Group I — direct-RPC and claimed-actor boundary (T-901 … T-903)

| # | Scenario | Expected |
|---|---|---|
| **T-901** | **Direct RPC, unauthorized claim.** Service key; `p_actor_profile_id` = a profile with **no** relationship to the business | `SNAPSHOT_FORBIDDEN`; **zero** snapshot, dashboard and audit rows |
| **T-902** | **Direct RPC, authorized claim.** Service key; `p_actor_profile_id` = an active, genuinely owner-related profile | Succeeds. The audit row's `actor_profile_id` = **that claimed profile**, and the write is documented as a **claim, not verified authorship** — the audit comment's wording is the assertion subject |
| **T-903** | **Endpoint impersonation prevented.** Body carries `profile_id` / `actor_profile_id` / `target_profile_id` / `_router_user_email` / `created_by` naming a **different, genuinely related** profile, while the session belongs to an unrelated caller | Denied (403/404). Even where the named profile **would** be authorized, it cannot be borrowed: `p_actor_profile_id` = the **session's id-bound** profile, and the audit row records the session profile |

**What Group I does not claim:** T-902 does not establish that the claimed profile is the initiator. A service-key holder can assert any genuinely related profile; key custody remains the control, exactly as D1's and D2's trust-boundary text says.

### 5.3 Superseded mapping rows

| Old row | Old target | **Corrected target** |
|---|---|---|
| `T-N47 (5.1/5.2)` — forged `p_actor_profile_id` → always rejected | `T-207 + T-208` | **T-901** (unauthorized claim refused) + **T-902** (authorized claim accepted as a claim) |
| `T-N47b (5.2)` — `created_by` = claimed actor | `T-208` | **T-902** — the audit records the claim; `created_by` stays NULL |
| `T-N46 (5.2)` — body-named actor | `T-107` | **T-107** *and* **T-903** (the impersonation-specific case) |

`T-207` and `T-208` no longer appear in that table at all.

---

## 6. Correction 6 — existing-row preservation (promotion does modify existing rows)

### 6.1 The claim that was wrong

D2 §4 said *"Existing snapshot rows are **never** rewritten."* D4 §4 said *"no existing row is modified."* Both are **incorrect**: promotion deliberately updates existing rows, at D2 §3 step 11:

```sql
    update public.business_metric_snapshots
       set is_latest = false
     where business_id = p_business_id and id <> v_snapshot_id and is_latest = true;
```

The accurate statement is narrower and still strong: **no existing row's financial content is rewritten; a promoted business's previously-latest row has `is_latest` changed.**

### 6.2 Exact proposed change — D2 §4, replace the "No data rollback" paragraph

**Replace with:**

> **No content rollback — and one deliberate exception, stated plainly.** No existing row's financial content is written: columns, `metadata` and `confidence` on the 72 existing snapshots are untouched, and nothing is backfilled. **Promotion is the exception.** When a snapshot is promoted, the demote step sets `is_latest = false` on the business's previous `is_latest` row — a promotion-state change on an existing row, not a financial one, and it is **not** reverted by this rollback. The deployed partial unique index still guarantees exactly one `is_latest` row per business throughout.
>
> **Consequence for rollback:** the audit records the *promoted* snapshot, not the row that was demoted, so a rollback cannot reconstruct which row previously held `is_latest`. To keep that reversible, capture it before the run (D4 §3 probe 2) and restore manually if needed. This is a documented limitation of the audit's scope, not a defect in it.

### 6.3 Exact proposed change — D4 §3 probe 2, extend the pre-run capture

**Replace probe 2 with:**

| 2 | `select count(*) from public.business_metric_snapshots;` **and** `select id, business_id, is_latest from public.business_metric_snapshots where is_latest order by business_id;` | **72** — record the count; T-807 compares against it. Record the `is_latest` set verbatim: promotion may legitimately change it, and it is the only pre-existing state this work can alter |

### 6.4 Exact proposed change — D4 §4 item 3

**Replace with:** *"**No content rollback is needed** — no existing row's financial content is modified. Promotion may change `is_latest` on existing rows (§6.2); restore it from the probe-2 capture if required. Snapshots created in the shared test project are ordinary rows in the same table; delete them only deliberately, and remember the audit table's `RESTRICT` references mean a snapshot with audit rows cannot be deleted until the audit rows are."*

### 6.5 Corrected tests

| # | Corrected expectation |
|---|---|
| **T-401** | `created_by` is NULL on every **new** row, and **no existing row's `created_by` is written**. Financial content of all 72 existing rows unchanged. *(The former wording — "all 72 existing rows unchanged" — was too broad.)* |
| **T-404** | Demote then promote; exactly one `is_latest` row afterwards; **the previously-latest row's id is no longer `is_latest`** — asserted by id, not by count alone |
| **T-405** | Backward promotion is allowed and reported; **the pre-existing `is_latest` row is demoted as part of it**, so exactly one `is_latest` remains |
| **T-807** | Row **count** unchanged at 72; **no financial column or `metadata` rewritten** on any existing row; **`is_latest` may differ from the pre-run capture on the promoted business only** — compare against the probe-2 set: at most one business differs, and it holds exactly one `is_latest` |
| **T-403** | A deduped promotion leaves exactly one `is_latest`; the row promoted is the deduped one, and any other is demoted |

---

## 7. Correction 7 — response shape and audit assertions against the exact SQL return

### 7.1 The successful-response contract, verified key by key

The SQL returns ten keys. Every one is read; no key is read that the SQL does not return.

| SQL return key | SQL value | D1 read | Verdict |
|---|---|---|---|
| `snapshot_id` | `v_snapshot_id` | `result?.snapshot_id ?? null` | ✓ |
| `deduplicated` | `v_dedup` | `result?.deduplicated === true` | ✓ |
| `dashboard_metrics_updated` | `v_dashboard_done` | `result?.dashboard_metrics_updated === true` | ✓ |
| `dashboard_skipped_reason` | `v_dashboard_skip` | `?? 'projection_disabled'` fallback | ✓ — see 7.2 |
| `promoted_over_newer` | `v_promoted_over_newer` | `=== true` | ✓ |
| `snapshot_type` | `coalesce(v_existing_type, v_snapshot_type)` | `?? null` | ✓ |
| `is_latest` | `v_is_latest_now` | `=== true` | ✓ |
| `applied` | `v_metrics \|\| v_meta_metrics` — **object** | `Object.keys(...)` | **✗ was always empty — Correction 1** |
| `skipped` | `coalesce(p_skipped, '[]')` — array of `{field_id, reason}` | `{field, reason}` | **✗ collapsed — Correction 1.4** |
| `confidence_score` | `coalesce(v_existing_confidence, v_confidence_stored)` | `?? null` | ✓ — the stored value on both paths; NULL stays NULL (T-504) |

Endpoint-only keys (`success`, `fields_mapped`, `fields_skipped`, `message`) are not SQL keys and are covered by T-806/T-811.

### 7.2 One behaviour worth stating (no code change)

While projection is disabled, D1 sends `p_update_dashboard: false`, so the **RPC never sets a reason** and `dashboard_skipped_reason: 'projection_disabled'` is synthesised by the **endpoint's fallback**. A reviewer asserting the string against a *direct* RPC call also gets it, because that call passes `true` and the SQL's own constant produces it. Both paths yield the same string by design; neither relies on the other. Recorded in T-601 so the assertion's provenance is unambiguous.

### 7.3 Corrected and new tests

**T-806 (corrected) — response body.** All eleven endpoint keys present, plus: `fields_mapped` is an **array of objects** `{field, mapped_to}` and non-empty whenever the SQL returned a non-empty `applied`; `fields_skipped` entries carry **`field_id` and `reason`**; on `deduplicated: true` the message states the snapshot already existed (not that one was created).

**T-414 (new) — audit completeness.**

| Assertion | Expected |
|---|---|
| Rows written per accepted call (insert path) | Exactly **1** |
| Rows written per accepted call (dedupe path) | Exactly **1** |
| `snapshot_id` | Equals the response's `snapshot_id` |
| `business_id` | The document's business |
| `content_hash` | Equals the snapshot's stored `metadata.content_hash` |
| `actor_profile_id` | The profile D1 claimed (T-902 notes this is a claim) |
| `actor_base44_user_id` | The session user id passed as `p_actor_base44_user_id` |
| `deduplicated` | Mirrors the response flag |
| `dashboard_updated` | `false` for every row while projection is disabled |
| `is_latest_requested` | Mirrors the request's `isLatest` (the **request**, not the outcome) |
| `submitted_at` | Not null; server-set; inside the call window |
| Any refused call (Groups A–C) | **Zero** audit rows |

**T-402 (corrected) — dedupe attribution.** Two audit rows, **same `content_hash`**, **different `actor_profile_id` and `actor_base44_user_id`** (each caller's own), different `submitted_at`, `deduplicated` true only on the second; one snapshot, whose `metadata` and `created_by_base44_user_id` keep the **first** writer's values and whose `created_by` stays NULL.

---

## 8. Change register (exact, nothing else)

| # | File | Location | Operation |
|---|---|---|---|
| C1 | `01_BASE44_SPEC` | §3, the `mapped` block | replace |
| C1 | `01_BASE44_SPEC` | §3, `message:` | replace |
| C1 | `01_BASE44_SPEC` | §3, `fields_skipped:` | replace |
| C1 | `03_TEST_PLAN` | Group H | **add T-811** |
| C1 | `03_TEST_PLAN` | Group H, T-806 | extend |
| C2 | `01_BASE44_SPEC` | `assertSnapshotAuthority` | **no change** |
| C2 | `03_TEST_PLAN` | Group B | **add T-210b** |
| C3 | `03_TEST_PLAN` | Group C, T-306 | replace |
| C4 | `03_TEST_PLAN` | Group C, T-304 | replace |
| C4 | `03_TEST_PLAN` | Group C | **add T-313** |
| C5 | `03_TEST_PLAN` | Group B T-207/T-208 | **no change** |
| C5 | `03_TEST_PLAN` | new Group I | **add T-901, T-902, T-903** |
| C5 | `03_TEST_PLAN` | §9 mapping table | 3 rows corrected |
| C6 | `02_SQL_MIGRATION` | §4, "No data rollback" paragraph | replace |
| C6 | `04_PRECHECK` | §3 probe 2 · §4 item 3 | replace |
| C6 | `03_TEST_PLAN` | T-401, T-403, T-404, T-405, T-807 | correct |
| C7 | `04_PRECHECK` | §6 interface check | add the two corrected rows + the T-806/T-414 references |
| C7 | `03_TEST_PLAN` | Group D | **add T-414** |
| C7 | `03_TEST_PLAN` | Group D, T-402 | extend |
| F1 | `01_BASE44_SPEC` · `03_TEST_PLAN` | §3 message · T-811 | plural grammar + partial-snapshot expectation |
| F2 | `03_TEST_PLAN` | Group I, T-903 | zero-write denial; no audit row; no RPC call with a body-supplied actor |
| F3 | `03_TEST_PLAN` · `04_PRECHECK` | T-807 · §3 probe 2 | compare `is_latest` per business |

**All thirteen rows above are applied to the four documents.**

**Test-ID uniqueness after this file:** Groups A–H keep their existing IDs; additions are **T-210b, T-313, T-414, T-811, T-901, T-902, T-903**. No ID is reused, and **T-207/T-208 keep a single meaning each.**

---

## 9. The three final corrections (also applied)

### F1 — T-811's expected message, and message grammar

T-811's fixture maps five targets and skips one. With the corrected generator the message is:

```
Snapshot created with 5 fields. 1 field skipped (partial snapshot).
```

The proposed generator now pluralizes, so one skipped field reads **"1 field skipped"** and several read **"N fields skipped"** (and the mapped count likewise): `const plural = (n, noun) => \`${n} ${noun}${n === 1 ? '' : 's'}\``, applied to both counts in all three message branches.

### F2 — T-903 is a zero-write denial

A denied impersonation attempt creates **zero snapshots, zero dashboard changes and zero audit rows**, and the endpoint **never invokes the snapshot RPC with the body-supplied actor identity**. The audit table is written only on an accepted call (D2 §3 step 13), so the earlier expectation that a denied attempt produces an audit record was wrong and is withdrawn.

### F3 — T-807 compares promotion state per business

Multiple promotion tests may touch different businesses, so the comparison is **by business**, against the pre-run capture: a difference is allowed **only** for a business a promotion test explicitly targeted, every untouched business must be byte-identical, and the unique-latest invariant is asserted for every affected business. Probe 2 in deliverable 4 now captures that set.

---

## 10. Readiness verdict

**CONDITIONALLY READY — every identified defect corrected; no new blocker found. The four documents are now internally consistent.**

Six of the seven items produced a concrete change; one produced a verified negative result:

| Item | Finding |
|---|---|
| 1 — `applied` mapping | **Real defect.** `Array.isArray` on an object meant `fields_mapped` was empty and the message said "0 fields" on *every* success. Fixed, with T-811. The same block also collapsed `field` into `reason` on `fields_skipped` — fixed, with the only consumer's usage checked |
| 2 — `isAdmin` | **Verified, no change.** Read from `actor.ts`: standing derives from `profiles.app_role` alone, through the exported `ADMIN_ROLES`; the Base44 role is never consulted, and the SQL layer uses the same list. T-210b added to prove it |
| 3 — T-306 | Test expectation was wrong and would have rejected a legitimate one-loan debt schedule. Corrected |
| 4 — T-304 | Precedence mis-stated: the reserved-key arm is unreachable from caller input. Corrected, plus T-313 to prove its inertness |
| 5 — T-207/T-208 | Meanings preserved; the claimed-actor cases moved to Group I with unique IDs; §9 mapping corrected |
| 6 — existing rows | The preservation claim was **false** — promotion modifies `is_latest` on existing rows. Corrected in the migration's rollback text, the precheck, and four tests. A genuine, previously unstated limitation surfaced: the demoted row is not identifiable from the audit, so reversibility needs the probe-2 capture |
| 7 — response/audit | Keys reconciled one by one; two mismatches found (both in item 1's block) and resolved; audit assertions bound to the exact audit columns; T-414 added |

**Nothing else was found.** No contradiction remains between D1, D2, D3 and D4 once this file is applied — the seven items account for every mismatch identified.

**Conditions before Gate B (unchanged from D4 §8, plus one):**
1. authorization of the **existing shared test project** as target (it is **not** an isolated project — Revision 7 / plan **B13**), separately from CB-005B;
2. confirmation that the pre-apply probes return their expected values — probe 2 now also captures the pre-run `is_latest` set;
3. authorization to apply the migration, then the Base44 file and the one-line UI change, then run the plan;
4. **new:** apply these corrections to the four documents, or treat this file as governing for the corrected items, so the implementation and the reviewed documents agree.

**Carried risk, unchanged:** the path becomes functional for the first time (projection off, so nothing reaches a dashboard); confidence will be sparse by design (168 of 248 field rows unscored); one of eight profiles is unbound and denied; two documents lack a reporting year; the service key remains the trust root.

**Gate B remains unauthorized.** Nothing has been implemented, executed, deployed or changed — no runtime application code, no SQL, no test run, no Supabase environment. The four consolidated documents have been **updated to be internally consistent** with every correction above; this file is their change record and no longer governs.