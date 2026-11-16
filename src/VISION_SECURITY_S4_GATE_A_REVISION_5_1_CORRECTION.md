# Phase S4 — Gate A **Revision 5.1** · Correction Report
## PROPOSAL ONLY · **Gate B NOT AUTHORIZED** · no implementation performed

**Bases:** `VISION_SECURITY_S4_GATE_A_REVISION_5.md`, `..._REVISION_5_SQL.md`, `..._REVISION_5_TESTS.md` (the three Revision 5 documents).
**This report contains only deltas.** Every validated Revision 5 decision stands unless corrected below.

**Scope:** no SQL executed · no migration created · no application code modified · no tests run · nothing deployed · no production or isolated data changed · CB-005A, CB-005B, provider sync, Galileo and the Digital Twin untouched.

**Evidence added in this revision (read-only):** the bodies and ACLs of `public.is_super_admin()`, `public.current_app_role()` and `public.can_access_business()`; duplicate and unbound `base44_user_id` bindings; confidence-score shape across accepted/corrected fields; per-document field-count shape. No financial rows read.

---

## 0. Corrections at a glance

| # | Correction | Severity before | Layer |
|---|---|---|---|
| **C-1** | `loadAuthorizedDocument` swallows **every** authorization failure into 404 — including infrastructure failures. Denial and failure must be distinguished. | **High** — a database outage would be reported as "not found", silently | Base44 |
| **C-2** | Actor identity is resolved but never **proven**: no ambiguity, binding or override check. | Medium | Base44 |
| **C-3** | Snapshot confidence averages **every** accepted field of the document, not the contributing rows — so an unrelated field moves the confidence **and the content hash**. | Medium | SQL |
| **C-4** | Dashboard projection writes a shared, unarbitrated row. **Disabled** for the initial isolated implementation. | **High** — mixed-source dashboard values | Base44 + SQL |
| **C-5** | The admin predicate chain is read and reported; privilege exposure recorded as an **open finding, not a resolved issue**. | Informational | — |

**Decisions applied:** the append-only audit table is **approved** (§C-5.3, subject to the security and rollback validation below); D-4 advisor authority stays **disabled**; a valid reporting year is **required** (no `CURRENT_DATE` fallback); the deployed **`projection`** enum value is used; the corrected **dashboard partial-index syntax is preserved** in the migration even though projection is deferred; CB-005A, CB-005B, provider sync, Galileo and the Digital Twin are untouched.

**Register updates:** **D-15 → APPROVED**; **D-17 → APPROVED** (year required); **D-18 → APPROVED** (`projection` in the UI and both allowlists); **D-16 → superseded** — the cross-writer limitation is no longer *accepted while live*, because the projection is **off**; metric-level provenance and writer arbitration become a **prerequisite for enabling it**, not for Gate B. New **D-19 → DECIDED**: dashboard projection disabled for the initial isolated Gate B implementation.

---

## 1. Exact required changes

### C-1 — Authorization error handling (Base44: `loadAuthorizedDocument`)

**Defect.** Revision 5 ends the authority check with an unqualified `catch`:

```ts
  try {
    await assertSnapshotAuthority(sb, actor, doc.business_id);
  } catch {
    throw new HttpError(404, 'Not found');       // ← swallows 500s too
  }
  return doc;
```

`assertSnapshotAuthority` raises **403** for a policy denial and **500** for a failed lookup. The bare `catch` collapses both, so a database failure, a timeout or a misconfiguration is reported to the caller as *"Not found"* — a silent failure masquerading as a policy decision.

**Replace with:**

```ts
  try {
    await assertSnapshotAuthority(sb, actor, doc.business_id);
  } catch (error) {
    // A DENIAL is a policy verdict: report it exactly as absence, so a caller cannot use the
    // response to discover that a tenant or document exists (D-1).
    // EVERYTHING ELSE — a failed query, a timeout, a configuration fault — is an infrastructure
    // failure. It is logged and reported as a generic 500. It is NEVER converted into a 404,
    // because that would disguise an outage as a policy decision, and it NEVER falls through.
    const status = typeof (error as any)?.status === 'number' ? (error as any).status : 500;
    if (status === 403) throw new HttpError(404, 'Not found');
    console.error('[snapshot] authority check failed');
    throw new HttpError(500, 'Internal server error');
  }
  return doc;
```

**Why this is complete:**

- The throw happens **inside** `loadAuthorizedDocument`, before the field read and long before the RPC, so no path continues after an authorization failure.
- `errorResponse` already maps ≥500 to `{ error: 'Internal server error' }` and <500 to our own message, so no database text and no internal detail reaches the caller.
- The 404 for a denial is **byte-identical** to the 404 for a nonexistent document (`if (!doc) throw new HttpError(404, 'Not found')`), preserving the non-disclosure property.
- No new error vocabulary is introduced; the only change is *which* statuses are collapsed.

**Naming note:** Revision 5 calls this `assertSnapshotAuthority`. The requirement refers to it as `assertSnapshotBusinessAuthority`; if that name is preferred, rename the function and its single call site — no behaviour changes.

---

### C-2 — Actor identity (Base44)

**Trace (verified against `base44/shared/authz/actor.ts`):**

```
Base44 session            base44.auth.me()  →  user            (trusted auth context ONLY)
  ↓ user.id
canonical profile         profiles.base44_user_id = user.id    (maybeSingle)
  ↓ only if that misses
email fallback            profiles.email ILIKE user.email
  ↓
Actor { profile, profile_id, role, isAdmin, isSuperAdmin }     ← single source of the actor id
  ↓
p_actor_profile_id        actor.profile_id                     ← the ONLY value the RPC receives
```

**What is already correct and must be preserved:**

- `resolveActingProfile` — the module's *target-override* path, which honours a body-supplied `target_profile_id` / `target_email` — is **not imported and not used** in this file.
- The request body is parsed **after** authentication and is read only for `documentId`, `snapshotType`, `isLatest`, `updateDashboard`. No body field is ever assigned to `actor`, to `profile_id`, or to `p_actor_profile_id`.

**What is missing.** `authenticateActor` ignores the query error and the collision case: `profile = data || null` discards a PostgREST error, and `.maybeSingle()` reports *"multiple rows"* as an error with `data = null`. A duplicated `base44_user_id` would therefore degrade silently into the **email fallback**, i.e. potentially a *different* profile than the one the session should resolve to. Verified today: **0 duplicate bindings** and **1 profile unbound** (`base44_user_id` NULL, with an email present) — so the fallback path is live for exactly one profile.

**Add this function** (immediately after `assertActiveProfile`):

```ts
/**
 * assertCanonicalActorIdentity — proves the actor profile came from the SESSION and that the
 * resolution is unambiguous.
 *
 * WHY IT EXISTS: the shared module resolves the profile by `base44_user_id` and falls back to an
 * email match. It discards a query error, and `.maybeSingle()` reports a duplicated binding as an
 * error with no data — either of which would silently degrade into the email fallback and resolve
 * a DIFFERENT profile. This function closes that gap locally, for this path, without changing the
 * shared module that every other feature depends on.
 *
 * IT CANNOT BE INFLUENCED BY THE REQUEST: no parameter here is derived from the request body.
 */
async function assertCanonicalActorIdentity(sb: any, actor: any) {
  const sessionUserId = actor?.user?.id;
  if (!sessionUserId) throw new HttpError(401, 'Unauthorized');

  // 1. The resolved profile must exist and be the one the shared module handed us.
  if (!actor.profile || !actor.profile_id || actor.profile.id !== actor.profile_id) {
    throw new HttpError(403, 'Forbidden');
  }

  // 2. AMBIGUITY: the Base44 → profile binding must resolve to EXACTLY ONE profile.
  const { count, error } = await sb
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('base44_user_id', sessionUserId);

  if (error) {
    console.error('[snapshot] identity count failed');
    throw new HttpError(500, 'Internal server error');
  }
  if ((count ?? 0) > 1) {
    console.error('[snapshot] ambiguous Base44→profile binding');
    throw new HttpError(403, 'Forbidden');
  }

  // 3. BINDING: the strong link (base44_user_id) is required. The email link is accepted ONLY
  //    when the column is unset, and then only on an exact, case-insensitive match — which is
  //    exactly the fallback the shared module uses, asserted rather than assumed.
  const boundById = actor.profile.base44_user_id === sessionUserId;
  const sessionEmail = String(actor.user?.email || '').trim().toLowerCase();
  const profileEmail = String(actor.profile.email || '').trim().toLowerCase();
  const boundByEmail = !actor.profile.base44_user_id && sessionEmail !== '' && sessionEmail === profileEmail;

  if (!boundById && !boundByEmail) {
    console.error('[snapshot] actor profile is not bound to the session identity');
    throw new HttpError(403, 'Forbidden');
  }
  if (!boundById) console.warn('[snapshot] actor resolved by email fallback (no base44_user_id)');
}
```

**Call site** — replaces the two existing lines:

```ts
    // ── 1. IDENTITY — the real boundary: session, canonical profile, unambiguous binding. ──
    const actor = await authenticateActor(base44, sb);
    await assertCanonicalActorIdentity(sb, actor);   // NEW — missing / duplicate / unbound
    assertActiveProfile(actor);                      // status allowlist
```

**Behaviour on each identity case:** missing session → **401**; no profile row → **403** (status is undefined, so the allowlist also refuses); duplicate binding → **403** fail-closed and logged; profile bound by neither id nor email → **403**; profile unbound but email-matching → **allowed**, logged; inactive status → **403**.

**Trust boundary (unchanged in substance, now enforced):** `p_actor_profile_id` is a *claim* by a service-role caller and proves nothing on its own. The RPC re-validates the profile, its status and its relationship to the business. Base44 is the authentication boundary; the service key remains the trust root. Attribution (`p_actor_base44_user_id`) is recorded and is never an authorization input.

**Static proofs to add to the suite** (cheap, and they catch a future regression):

- `grep -c "resolveActingProfile" base44/functions/createSnapshotFromReviewedFields/entry.ts` → **0**
- `grep -n "p_actor_profile_id" .../entry.ts` → the value is `actor.profile_id`, exactly once
- `grep -nE "body\.[a-z_]*profile|body\.[a-z_]*identity|_router_user" .../entry.ts` → **0 matches**

---

### C-3 — Confidence and content identity (SQL)

**Defect.** Revision 5 computes the confidence as a mean over **every** accepted/corrected field of the document:

```sql
  select avg(f.confidence_score::numeric) into v_confidence
    from public.extracted_fields f
   where f.document_id = p_source_document_id
     and f.business_id = p_business_id
     and f.review_status in ('accepted','corrected');
```

Because `confidence` is part of the content hash, **an unrelated accepted field changes both the snapshot's confidence and its identity** — accepting a field that feeds no target can create a "new" snapshot from identical content. It also explains a second, latent hazard: `confidence_score` is **text** (verified), so a non-numeric value would raise a cast error (`22P02`) rather than a controlled refusal.

**Replace the derived-confidence block with:**

```sql
  -- ── 7. CONTRIBUTORS + CONFIDENCE — the SAME set that produced the values ──
  -- The contributor set is exactly the ids the value loop accepted, deduplicated. Provenance
  -- (metadata.provenance) records the same ids per target, so provenance and confidence are
  -- computed from one set and cannot disagree.
  select array_agg(distinct c::uuid) into v_contributor_ids
    from jsonb_array_elements(v_source_input) e,
         jsonb_array_elements_text(e->'ids') c;

  if v_contributor_ids is null or array_length(v_contributor_ids, 1) is null then
    raise exception 'SNAPSHOT_NO_CONTRIBUTORS' using errcode = '22023';
  end if;

  select count(*),
         count(*) filter (where f.confidence_score ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$')
    into v_contributor_count, v_scored_count
    from public.extracted_fields f
   where f.id = any (v_contributor_ids);

  -- Tripwire: a contributor that vanished between the value loop and here is drift, not a case.
  if v_contributor_count <> array_length(v_contributor_ids, 1) then
    raise exception 'SNAPSHOT_CONTRIBUTOR_DRIFT' using errcode = '42501';
  end if;

  -- confidence_score is TEXT and 5 of the 13 accepted/corrected rows carry NO score, so the
  -- guard is real, not theoretical. Only parseable scores are averaged.
  select avg((f.confidence_score)::numeric) into v_confidence
    from public.extracted_fields f
   where f.id = any (v_contributor_ids)
     and f.confidence_score ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$';

  -- NULL means UNKNOWN and is stored as NULL — never 0. If no contributor carries a score, the
  -- snapshot's confidence is unknown, and saying so is the honest answer.
  v_confidence_stored := case when v_scored_count > 0 then round(v_confidence, 2) else null end;
```

**Also required:**

- **Remove** the Revision 5 assertion `if v_confidence is null then raise exception 'SNAPSHOT_CONFIDENCE_UNAVAILABLE'` — replaced by the NULL-permitted rule above.
- **Remove** `SNAPSHOT_CONFIDENCE_UNAVAILABLE` from the Base44 `RPC_ERROR_STATUS` map (the code no longer exists).
- **Add to the `declare` block:** `v_contributor_ids uuid[]; v_contributor_count integer; v_scored_count integer;`
- Move the backward-promotion report out of the dashboard block (see C-4) so it survives projection being disabled.

**NULL handling, defined explicitly:**

| Case | Stored `data_confidence_score` | Response `confidence_score` | Hash |
|---|---|---|---|
| Every contributor scored | mean of contributors, 2 dp | the same value | includes the value |
| Some contributors scored | mean of the **scored** contributors, 2 dp | the same value | includes the value |
| **No contributor scored** | **NULL** — never 0 | `null` | includes JSON `null`, so it is stable and dedupes correctly |

`data_confidence_score` is **nullable** with default `0` (verified) — so NULL is permitted, and storing `0` would be the doctrine violation the platform already tests for elsewhere.

**Why unrelated fields can no longer change the hash** — the complete input list, with the source of each:

| Hash key | Derived from | Moved by an unrelated accepted field? |
|---|---|---|
| `business`, `document`, `profile` | the document row | **No** |
| `mapping_version`, `document_type`, `basis` | the contract + the document | **No** |
| `snapshot_type`, `snapshot_date` | the request + `documents.year` | **No** |
| `values`, `sources` | the contract order over **contributors only** | **No** |
| `confidence` | **contributors only — after this correction** | **No** (was **Yes** before) |

The skipped-field list is returned to the caller and is **not** persisted on the row, so it cannot enter the hash either.

---

### C-4 — Dashboard projection disabled for the initial isolated implementation

**Base44.** Add one constant beside the others:

```ts
/**
 * DASHBOARD PROJECTION — DISABLED for the initial isolated Gate B implementation.
 *
 * `dashboard_metrics` is written by TEN application paths with no arbitration, so projecting a
 * snapshot into it would put snapshot-sourced and assessment-sourced values in the same row with
 * no way to tell them apart. Snapshot persistence and latest-snapshot promotion are UNAFFECTED:
 * only the projection into dashboard_metrics is withheld. Flipping this constant — together with
 * the matching constant in the RPC — is the ONLY change needed to enable it, once metric-level
 * provenance and writer arbitration exist (§1 C-4.4).
 */
const DASHBOARD_PROJECTION_ENABLED = false;
```

**Call site** — the request may *ask*; the constant decides:

```ts
      // The request may ASK for a projection. The constant decides whether one is attempted, and
      // the RPC re-checks its own constant, so a direct RPC call cannot bypass this either.
      p_update_dashboard: updateDashboard === true && DASHBOARD_PROJECTION_ENABLED,
```

**Response** — one field that always explains the outcome:

```ts
      dashboard_metrics_updated: result?.dashboard_metrics_updated === true,  // always false while disabled
      dashboard_skipped_reason: result?.dashboard_skipped_reason
        ?? (updateDashboard === true && !DASHBOARD_PROJECTION_ENABLED ? 'projection_disabled' : null),
```

**SQL.** Add the constant and guard the whole projection block; the guarded body — including the corrected partial-index syntax — is **preserved verbatim** so enabling it is a one-constant change:

```sql
  v_dashboard_projection_enabled constant boolean := false;   -- D-19: disabled for Gate B
```

```sql
  -- ── 11. DASHBOARD PROJECTION — DISABLED (D-19) ────────────────────────────
  -- Snapshots and promotion are unaffected; only the projection INTO dashboard_metrics is
  -- withheld. A direct RPC call with p_update_dashboard => true is refused HERE, by this
  -- constant — not by trusting the caller to have disabled it.
  if not v_dashboard_projection_enabled then
    if coalesce(p_update_dashboard, false) then
      v_dashboard_skip := 'projection_disabled';
    end if;
  elsif coalesce(p_update_dashboard, false) then
    if not v_is_latest_now then
      v_dashboard_skip := 'not_latest';
    elsif (v_metrics ? 'annual_revenue' or v_metrics ? 'net_profit') then
      -- ── PRESERVED FOR THE FUTURE ENABLE (D-19). The conflict target MUST carry the index
      --    predicate: ux_dashboard_metrics_business_id is a PARTIAL unique index, and a bare
      --    ON CONFLICT (business_id) is NOT inferred by PostgreSQL. Do not simplify this.
      insert into public.dashboard_metrics as dm
        (business_id, profile_id, annual_revenue, net_profit, latest_snapshot_id, created_at, updated_at)
      values (p_business_id, v_doc_profile,
              (v_metrics->>'annual_revenue')::numeric,
              (v_metrics->>'net_profit')::numeric,
              v_snapshot_id, clock_timestamp(), clock_timestamp())
      on conflict (business_id) where business_id is not null
      do update set
        annual_revenue     = coalesce(excluded.annual_revenue, dm.annual_revenue),
        net_profit         = coalesce(excluded.net_profit, dm.net_profit),
        latest_snapshot_id = excluded.latest_snapshot_id,
        updated_at         = clock_timestamp();

      v_dashboard_done := true;
    else
      v_dashboard_skip := 'no_dashboard_metrics';
    end if;
  end if;
```

**Promotion reporting moves out of the projection block** (so it works while disabled) — inside the `is_latest` step:

```sql
  if coalesce(p_is_latest, false) then
    -- Captured BEFORE the demotion, independently of the projection: a promotion that moves the
    -- business's basis BACKWARDS is worth reporting even while nothing is written to the dashboard.
    select sm.snapshot_date into v_previous_latest_date
      from public.business_metric_snapshots sm
     where sm.business_id = p_business_id and sm.is_latest and sm.id <> v_snapshot_id
     order by sm.snapshot_date desc limit 1;

    update public.business_metric_snapshots
       set is_latest = false
     where business_id = p_business_id and id <> v_snapshot_id and is_latest = true;
    update public.business_metric_snapshots
       set is_latest = true
     where id = v_snapshot_id;
    v_is_latest_now := true;

    if v_previous_latest_date is not null and v_snapshot_date < v_previous_latest_date then
      v_promoted_over_newer := true;
    end if;
  elsif v_dedup then
    v_is_latest_now := coalesce(v_existing_latest, false);
  else
    v_is_latest_now := false;
  end if;
```

**What is preserved, and how the write is prevented at both layers:**

| Property | Status |
|---|---|
| Snapshot persistence | **Preserved** — unchanged |
| Latest-snapshot promotion (demote → promote) | **Preserved** — unchanged, and still the only place `is_latest` changes |
| Backward-promotion reporting (`promoted_over_newer`) | **Preserved** — moved out of the projection block |
| `dashboard_metrics` writes | **None.** No INSERT, no UPDATE, no `latest_snapshot_id` |
| Base44 prevention | `p_update_dashboard` is sent as `false` while the constant is false |
| SQL prevention | The RPC re-checks its **own** constant first, so even a service-role caller passing `p_update_dashboard => true` cannot reach the upsert |
| Existing dashboard writers and policies | **Untouched** — no other function, table or policy is modified |

**Consequence to note:** because nothing writes `latest_snapshot_id` while the projection is off, the Revision 5 §5.2 reconciliation query (which joins `dashboard_metrics.latest_snapshot_id` to the snapshot) returns **nothing** — it becomes live again the moment projection is enabled. Promotion history remains fully visible through `business_metric_snapshots.is_latest` alone.

**C-4.4 — separate future design for metric-level provenance and writer arbitration** (not implemented, not approved here; it is the prerequisite for enabling projection):

1. **Ownership.** Decide, per metric, which source owns `dashboard_metrics`: projection-owned (`annual_revenue`, `net_profit`), assessment-owned, or engine-owned. Nothing else may write an owned metric.
2. **Provenance.** A `dashboard_metric_provenance` table — `(business_id, metric_key, value, source_type, source_id, writer_profile_id, written_at)` — appended by **every** writer that touches the row, so the current value always names its source.
3. **Arbitration.** One rule, decided and tested: either a single writer per metric (preferred), or an explicit conflict rule (e.g. a write is refused when it would overwrite a strictly newer provenance row unless it declares itself a promotion).
4. **Reconciliation.** The §5.2 query becomes a live guard rather than a diagnostic, and every divergence it finds is attributable to a named writer.
5. **Enablement.** Only after 1–4: flip `DASHBOARD_PROJECTION_ENABLED` **and** `v_dashboard_projection_enabled` together, in one change-set, with a fresh test pass.

---

### C-5 — Security verification (reads performed, findings recorded)

#### C-5.1 The admin predicate chain — read in full

| Object | `SECURITY` | `search_path` | Body (as read) |
|---|---|---|---|
| `public.is_super_admin()` | **DEFINER** | `public` | `select coalesce(public.current_app_role() = 'super_admin', false);` |
| `public.current_app_role()` | **DEFINER** | `public` | `select app_role from public.profiles where id = auth.uid() limit 1;` |
| `public.can_access_business(target_business_id uuid)` | **DEFINER** | `public` | `select exists (select 1 from public.business_entities b where b.id = target_business_id and (b.profile_id = auth.uid() or b.assigned_advisor_id = auth.uid() or public.is_super_admin() or exists (select 1 from public.business_team_members tm where tm.business_id = b.id and tm.profile_id = auth.uid())));` |

**Anonymous verdict — proven, not inferred.** For a caller with no session, `auth.uid()` is NULL → `current_app_role()` returns no row → NULL → `coalesce(NULL = 'super_admin', false)` = **false** → `is_super_admin()` = **false**. Every remaining clause of `can_access_business` is a NULL comparison, which is not true. Therefore `can_access_business()` is **false for anonymous callers**, and the RLS policies on `business_metric_snapshots`, `dashboard_metrics` and `extracted_fields` deny them. `anon`'s live table privileges are not reachable through PostgREST.

#### C-5.2 Findings recorded — **not resolved**

| # | Finding | Status |
|---|---|---|
| **S-1** | **PUBLIC, `anon` and `authenticated` hold EXECUTE on all three existing predicates** — the ACL is `{=X/postgres, postgres=X/…, anon=X/…, authenticated=X/…, service_role=X/…}`, where the leading `=X/` is `PUBLIC`. Harmless **only** because these functions derive identity from `auth.uid()` and return false/NULL for anonymous callers. | **Open — the platform default.** The new S4 functions must be the deliberate exception: they accept a caller-supplied actor id, so PUBLIC EXECUTE would be a genuine hole. This is precisely why the REVOKE-first block is mandatory. |
| **S-2** | `anon` holds `SELECT/INSERT/UPDATE/DELETE` on `business_metric_snapshots` and `INSERT` on `dashboard_metrics`, `extracted_fields`, `documents` (default ACL, `arwdDxtm`). Contained by RLS alone. | **Open** — SEC-031/SEC-032 debt; unchanged by this packet. |
| **S-3** | **The RLS predicates compare `profiles.id = auth.uid()`, not `profiles.auth_user_id = auth.uid()`.** `profiles.id` is a generated UUID distinct from `auth.users.id`, so these policies can essentially never match a real session: they are deny-all today for a structural reason, not by design. | **Open** — sharpens Revision 5's P-2. Recorded, not fixed; it belongs with any future RLS work. |
| **S-4** | `can_access_business` admits `team_member` and assigned-advisor identities, which the snapshot policy denies. The RPC is not the only write path to these tables. | **Open** (Revision 5 P-1) — the snapshot policy is deliberately stricter. |

#### C-5.3 New objects — protection confirmed as a *plan*, verifiable only post-apply

The three new objects do not exist yet, so their privileges **cannot be confirmed against the deployed database**. What is confirmed is the default they must defeat: `pg_default_acl` grants `anon` and `authenticated` DML on new tables (`arwdDxtm`) and EXECUTE on new functions (`X`) in `public`, on top of PostgreSQL's own `EXECUTE`-to-`PUBLIC` default.

Required, and already specified in Revision 5 §4:

- `revoke all on function public.s4_mapping_contract(text) from public;` then `from anon, authenticated;` then `grant execute … to service_role;`
- the same REVOKE-first sequence for `public.create_reviewed_fields_snapshot(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,boolean,boolean)`
- `alter table public.snapshot_submission_audit enable row level security;` with **zero policies**, `revoke all … from public, anon, authenticated`, then `grant select, insert … to service_role`
- every signature schema-qualified and fully typed; `security invoker`; `set search_path = ''`

**Post-apply assertion** (test T-N44) is the only thing that *verifies* it:

```sql
select p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') as svc_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('s4_mapping_contract','create_reviewed_fields_snapshot');
-- expected: anon_exec = false, auth_exec = false, svc_exec = true
```

#### C-5.4 Audit table — approval conditions (security and rollback validation)

**Approved (D-15).** The design satisfies the conditions: append-only by construction (`RESTRICT` on every reference), least-privilege by explicit revoke plus deny-all RLS, and **outside** the content hash, so attribution never affects identity. Two validated properties worth stating:

- **Security:** no role other than `service_role` (and the owner/superusers) can read or write it; there is no policy to satisfy, so a mistake in `can_access_business` cannot expose it. `business_metric_snapshots` has **no DELETE policy**, so an audited snapshot cannot be deleted out from under its trail.
- **Rollback:** `drop table public.snapshot_submission_audit` discards submission history only — its references are `RESTRICT` *to* other tables, so it cannot cascade. If history matters at the moment of a rollback, revert the caller first and export the rows before dropping; the table is inert without the function.

---

## 2. Exact updated test cases and expected results

### 2.1 Changed expectations (previously specified in Revision 5)

| # | Test | Revision 5 expected | **Revision 5.1 expected** |
|---|---|---|---|
| T-N11 | Dashboard first write | one row created | **Superseded** — no row is created. Replaced by T-N25 |
| T-N12 | Concurrent dashboard writes | exactly one row | **Superseded** — deferred with the projection. Replaced by T-N28 (structural) |
| T-N13 | Partial metrics (`annual_revenue` only) | `net_profit` unchanged | **Superseded** — deferred with the projection |
| T-N14 | Older replay with `updateDashboard: true`, `isLatest: false` | `dashboard_skipped_reason = 'not_latest'` | **`dashboard_skipped_reason = 'projection_disabled'`** — the disabled constant is evaluated before the latest check |
| T-N15 | Backward promotion | `promoted_over_newer: true` | **Unchanged** — and now proves the report survives the projection being off |
| T-N16 | Duplicate promotes | existing row promoted | **Unchanged** — promotion is independent of the projection |
| P-3 | `updateDashboard` true/false | projection outcome varies | **`dashboard_metrics_updated: false`** and reason `projection_disabled` in both cases; the dashboard is never touched |
| T-N26 | *n/a* | *n/a* | The direct-RPC `p_update_dashboard => true` case becomes a **required** test (was implicit) |

### 2.2 New tests — authorization error handling

| # | Scenario | Expected result |
|---|---|---|
| **T-N36** | Authority lookup forced to fail (fixture breaks the `business_entities` read) | **500** with the generic body; **not** 404; the failure is logged; **zero writes**; no snapshot, no promotion, no audit row, no dashboard change |
| **T-N37** | Explicit denial (unrelated authenticated profile) and a nonexistent document id | **Both return an identical 404**: same status, same body. The two responses are byte-comparable and disclose nothing about tenant existence |
| **T-N38** | Document exists but belongs to another business | **404** — identical to the nonexistent case |
| **T-N39** | Authority check passes, then the field read fails | **500**; zero writes (the failure is not swallowed into a 400 or 404) |

### 2.3 New tests — actor identity

| # | Scenario | Expected result |
|---|---|---|
| **T-N40** | Session present, **no** `profiles` row for it | **403**; zero writes |
| **T-N41** | **Duplicate binding** (fixture: two profiles with the same `base44_user_id`) | **403** fail-closed, logged as ambiguous; zero writes — proves the email fallback cannot be reached by a collision |
| **T-N42** | Profile bound by **neither** `base44_user_id` nor email | **403**; zero writes |
| **T-N43** | Profile unbound (`base44_user_id` NULL) but the session email matches exactly | **Allowed**, with the fallback logged. This is the state of **1 of 8** profiles today |
| **T-N44** | Unbound profile whose session email differs in case only | **Allowed** (case-insensitive, matching the shared module's `ILIKE`) |
| **T-N45** | Unbound profile whose session email differs | **403**; zero writes |
| **T-N46** | Body carries `profile_id`, `actor_profile_id`, `_router_user_email`, `business_id` alongside a valid `documentId` | **Ignored**: the snapshot's `profile_id` equals the document owner's, and the audit row's `actor_profile_id` equals the session-resolved profile — never the body value |
| **T-N47** | Direct service-role RPC call with a forged `p_actor_profile_id` | `SNAPSHOT_FORBIDDEN`; zero writes (unchanged from Rev 5, now paired with T-N46) |
| **T-N48** | Static: `resolveActingProfile` absent; `p_actor_profile_id` sourced from `actor.profile_id` exactly once; no `body.*profile` pattern | All three greps return the expected counts |

### 2.4 New tests — confidence and content identity

| # | Scenario | Expected result |
|---|---|---|
| **T-N49** | **Unrelated field edited** — accept an additional field that feeds **no** target, with a very different `confidence_score`, then resubmit identical content | **Identical content hash**; `deduplicated: true`; stored `data_confidence_score` **unchanged**. This is the headline fix |
| **T-N50** | **Unrelated field added** — same as above, first submission vs second | No new snapshot; the skipped-field list in the response changes, and **nothing else does** |
| **T-N51** | **Contributor edited** — change one contributing field's `confidence_score`, values untouched | **New hash** ⇒ new snapshot; the new confidence reflects only contributors |
| **T-N52** | **Contributor value edited** | New hash ⇒ new snapshot (unchanged from Rev 5) |
| **T-N53** | **All contributors unscored** (fixture: every contributor's `confidence_score` NULL) | `data_confidence_score` **NULL** — never 0; response `confidence_score: null`; hash stable across repeats ⇒ a second identical call **dedupes** |
| **T-N54** | **Partial NULLs** — two contributors, one scored (60) and one NULL | Stored confidence = **60**, not 30: the mean covers the scored contributor only |
| **T-N55** | **Null-scored and scored mix across documents** | Provenance lists exactly the contributing ids per target; the confidence denominator equals the scored contributor count |
| **T-N56** | **Duplicate selection** — the same id offered for two targets | `SNAPSHOT_DUPLICATE_FIELD` before confidence is computed; zero writes |
| **T-N57** | A contributor's `confidence_score` holds a non-numeric string | Excluded from the mean (no `22P02`); if it is the only contributor, confidence is NULL. Defensive: **0 non-numeric values exist today** |
| **T-N58** | Contributor set drift (fixture deletes a contributor between the value loop and the count) | `SNAPSHOT_CONTRIBUTOR_DRIFT`; zero writes |

### 2.5 New tests — dashboard projection disabled

| # | Scenario | Expected result |
|---|---|---|
| **T-N25** | `updateDashboard: true` on a valid, promoted snapshot | `dashboard_metrics` **row count and `updated_at` unchanged** for that business; response `dashboard_metrics_updated: false`, `dashboard_skipped_reason: 'projection_disabled'`; `latest_snapshot_id` **not** written |
| **T-N26** | **Direct RPC call** with `p_update_dashboard => true` (service key) | Same: no dashboard change. Proves the SQL constant, not the caller, is the gate |
| **T-N27** | `updateDashboard: false` | `dashboard_skipped_reason: null`; dashboard untouched |
| **T-N28** | **Structural** — the migration still contains the projection body | `v_dashboard_projection_enabled constant boolean := false;` present; the body contains the exact text `on conflict (business_id) where business_id is not null`; no `not_latest` branch is reachable while the constant is false |
| **T-N29** | Promotion with projection disabled — promote an older snapshot | `is_latest` moves correctly; `promoted_over_newer: true`; **no** dashboard change |
| **T-N30** | Snapshot persistence with projection disabled | Row created with all metrics, `data_source`, `source_document_id`, `data_confidence_score`, `metadata.content_hash`; nothing else in the database changed |

### 2.6 New tests — security verification (post-apply only)

| # | Scenario | Expected result |
|---|---|---|
| **T-N44g** | `has_function_privilege` for both new functions | `anon` false, `authenticated` false, `service_role` true |
| **T-N21** | `anon` / `authenticated` call both functions directly | `permission denied for function` (unchanged) |
| **T-N22** | `anon` / `authenticated` attempt SELECT/INSERT on the audit table | Denied: revoked privileges **and** RLS with zero policies |
| **T-N31** | Audit row written on the insert path, and on the dedupe path by a different caller | One audit row per accepted submission; `deduplicated` distinguishes them; the snapshot keeps the first writer's attribution (unchanged from Rev 5) |

### 2.7 Unchanged

All Revision 5 adversarial cases (ADV-1 … ADV-26 — authority, status, value substitution, contract enforcement, NULL contributors, cardinality) and all positive/regression cases (P-1, P-2, P-4 … P-10) keep their Revision 5 expectations. `sum`/`mean` with exactly one contributor remains **valid**.

---

## 3. Remaining blockers, ranked by severity

| Rank | Blocker | Severity | State after Revision 5.1 |
|---|---|---|---|
| **1** | Authorization failures collapsed into 404 (C-1) — an outage reported as "not found" | **High** | **Fixed by the packet.** Must ship; the pre-fix behaviour is a silent-failure path |
| **2** | Dashboard projection writing a shared, unarbitrated row (C-4) | **High** | **Removed from scope by disabling projection.** Replaced by an explicit prerequisite for enabling it later |
| **3** | Confidence (and therefore the content hash) moved by non-contributing fields (C-3) | Medium | **Fixed by the packet** |
| **4** | Identity ambiguity: a duplicated `base44_user_id` silently degrades into the email fallback inside the shared module | Medium | **Mitigated locally** by C-2 (403 fail-closed). The **shared-module** weakness is recorded as a finding: `authenticateActor` discards the query error and `.maybeSingle()` hides a collision. 0 duplicates exist today |
| **5** | **1 of 8** profiles is bound by email only (no `base44_user_id`) | Medium-Low | **Accepted and made explicit**: allowed only on an exact, case-insensitive email match, and logged. Its snapshot authority depends on that email being the session email |
| **6** | RLS identity comparison uses `profiles.id = auth.uid()` rather than `auth_user_id` (S-3) | Medium | **Open — recorded, not fixed.** It makes the policies deny-all for a structural reason. Out of scope by decision |
| **7** | PUBLIC + `anon` + `authenticated` EXECUTE on existing predicates; `anon` holds DML on the snapshot tables (S-1, S-2) | Medium | **Open — recorded, not resolved.** Contained by RLS returning false. The new functions are the deliberate exception via REVOKE-first |
| **8** | **2 documents** carrying reviewed fields have no reporting year (62 of 78 documents overall) | Low | **Accepted**: refused with a controlled 409. Documents are **not** modified |
| **9** | The audit table's privileges cannot be verified until it exists | Low | **Closed by test T-N44g**, post-apply |
| **10** | Metric-level dashboard provenance and writer arbitration not designed | Low (was High) | **Deferred, and no longer blocking**, because projection is off |
| **11** | Pre-existing defects in unrelated writers (Revision 5 P-4/P-5/P-6: nonexistent columns selected; unmatched `ON CONFLICT` targets) | Informational | **Unchanged** — outside this phase |

**No first-call runtime blocker remains** in the corrected packet: every statement is supported by a verified column, constraint, index or privilege, and the four defects corrected in Revision 5 (invalid type literal, missing NOT NULL `profile_id`, un-inferred partial-index conflict target, redundant index) plus the four corrected here are all folded in.

---

## 4. Recommendation on isolated Gate B

**Recommendation: YES — isolated Gate B is READY for a separate authorization, subject to the four conditions below.**

The reasoning:

- **The highest-severity risk is removed.** With the projection disabled, this change **cannot move a dashboard**. The path becomes functional for the first time, but its only effect is a snapshot row plus an audit row — both additive, both scoped to the document's own business, both reversible by dropping the two functions and the one table.
- **The silent-failure path is closed.** After C-1, an infrastructure failure can no longer be reported as a 404, and an authorization failure can never fall through to a write.
- **Identity is proven, not assumed.** After C-2 the actor profile must be the session-bound profile, unambiguously, and no body field can reach it — with static checks that would catch a regression.
- **Identity stability is restored.** After C-3 the content hash moves only when content moves; an unrelated accepted field can no longer create a "new" snapshot from identical content.
- **No first-call blockers remain**, and the four conditions below are cheap, non-code, and already evidenced.

**Conditions:**

1. **Fold C-1 … C-5 into the Revision 5 documents** before applying anything, so the migration and the Base44 file are the corrected text — and **ship the one-line UI selector fix (`projection`) in the same change-set**.
2. **Approve the two-constant disable** (`DASHBOARD_PROJECTION_ENABLED`, `v_dashboard_projection_enabled`) and the corrected `promoted_over_newer` placement.
3. **Accept the data preconditions:** the **2** undated documents are refused with a controlled 409 and their year is **not** set by this work; the **1** email-bound profile is admitted only on an exact email match.
4. **Isolated environment only, and post-apply verification first** — run T-N44g and T-N21/T-N22 (privileges) immediately after the migration, before any functional test. Production, CB-005A, CB-005B, provider sync, Galileo and the Digital Twin remain untouched.

**What I am explicitly NOT recommending:** production deployment; enabling dashboard projection; narrowing the existing RLS policies (S-1, S-2, S-3, S-4); or reconciling the ten dashboard writers. Each is its own change with its own review.

**Gate B is NOT authorized. Nothing in this report has been implemented.**