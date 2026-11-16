# Phase S4 — Gate A **Revision 3** · Correction Packet
## (PROPOSAL — NOT APPLIED · Gate B NOT authorized)

**Base document:** `VISION_SECURITY_S4_SNAPSHOT_AUTHORIZATION_PREFLIGHT.md` (Revision 2).
This packet contains **only the deltas**. Every section of Revision 2 not named here stands unchanged.

**Scope:** no code implemented · no migration created · no SQL run · no tests executed · nothing deployed · no financial records written · production Supabase, CB-005A, CB-005B, providers and Digital Twin untouched.

**Evidence added in this revision (read-only):** counts and values from the exposed API, and read-only inspection of the repository's own source. No rows of financial data read; no PII emitted.

---

## 1. New verified evidence

| # | Fact | Bearing |
|---|---|---|
| **V-1** | `profiles.profile_status` values **in use**: 8 profiles total — `active` 1, `incomplete` 7, **every other candidate 0**, no NULLs. 8/8 accounted for. | The observed vocabulary is exactly `{active, incomplete}`. Any other value is unobserved, so it must fail closed. |
| **V-2** | The **only** occurrence of `profile_status` in the entire codebase is `shared/authz/actor.ts:122` (`=== 'suspended'`). No allowlist, no check constraint found in any migration in this repository. | There is **no declared canonical vocabulary in code**. The *declared* set (a DB check constraint, if any) is unverified → §4. |
| **V-3** | **`suspended` has 0 rows.** | The suspension path has never executed against data. Tests must synthesize it (§7). |
| **V-4** | `business_entities.assigned_advisor_id`: **0 of 9** businesses have an advisor assigned. | The advisor path is entirely unexercised today. |
| **V-5** | **No code in the repository writes or clears `assigned_advisor_id`** — every reference is a read. `decisionIntelligenceService` documents the certified pattern explicitly: *"NOT advisor_assignments — certified pattern uses assigned_advisor_id"*. | Confirms the column is the right source; **revocation is written outside this codebase** → **D-4 stays conditional** (§6). |
| **V-6** | `business_owners`: 3 rows, **none with `end_date`**. | The active-ownership date test is currently inert. Assumption A-5 remains unverified as semantics. |
| **V-7** | `business_metric_snapshots.created_by` is the **only** writer of that column anywhere in the repository, and its type is `uuid` (Gate A Revision 2). The FK target is **not verifiable without SQL**. | **D-13 stays conditional** (§6), with both branches specified. |
| **V-8** | `reviewed_at` is already used as the review-recency ordering column elsewhere in the platform (`shared/galileo/focusedDocument.ts:353` sorts by it). | A precedent for the explicit ordering in §2.2. |

---

## 2. Corrections to the proposed Base44 code

Replaces the corresponding blocks of Revision 2 §8.2. Everything else in that file is unchanged.

### 2.1 Correction 1 — the contract now declares source field, operation and cardinality

The contract stops being a lookup of target → field name and becomes an explicit, validated specification. Target→source coupling is what prevents an accepted expense from being mapped into `annual_revenue`.

```ts
/** The mapping contract version. Any change to FIELD_CONTRACT requires a new version string. */
const MAPPING_VERSION = 's4.mapping.v1';

/** Metadata keys owned by the writer. A contract target may never collide with one. */
const RESERVED_METADATA_KEYS = [
  'mapping_contract', 'basis', 'content_hash', 'provenance', 'created_by_base44_user_id',
];

/**
 * FIELD_CONTRACT — a MIRROR of the authoritative contract, which lives in the database
 * (`public.s4_mapping_contract(version)`, §3.1). This copy exists only to build the selection.
 * The database re-validates every entry against its own copy and refuses anything that does
 * not match, so a drift between the two FAILS CLOSED — it can never produce a wrong value.
 * Parity between the two declarations is asserted by a test (§7, T-1).
 *
 * `from`       the ONLY extracted_fields.field_name permitted to feed this target
 * `op`         direct (exactly one row) | sum | mean (one or more rows)
 * `cardinality` one | many   — enforced server-side
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
      // No column exists for total_liabilities (F-3); it persists in metadata under this exact key.
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
```

### 2.2 Correction 4 — deterministic selection order (replaces the field read)

```ts
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

    /**
     * Deterministic review-recency ordering: reviewed_at (NULLs first) → created_at → id.
     * Revision 2 relied on the API's unspecified row order; the winner is now explicit and
     * reproducible, so the same inputs always select the same value.
     */
    const recency = (v: any) => (v ? Date.parse(v) : Number.NEGATIVE_INFINITY);
    const orderedFields = [...(fields || [])].sort((a, b) => {
      const byReview = recency(a.reviewed_at) - recency(b.reviewed_at);
      if (byReview !== 0) return byReview;
      const byCreated = recency(a.created_at) - recency(b.created_at);
      if (byCreated !== 0) return byCreated;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
```

The selection loop then iterates **`contract.targets` in declared order** (not the caller's field order), which is what makes provenance and hashing deterministic:

```ts
    const fieldMap: any[] = [];
    const used = new Set<string>();

    for (const spec of contract.targets) {
      const ids = (idsByName.get(spec.from) || []).slice(-1);       // one row: last reviewed wins
      const all = idsByName.get(spec.from) || [];                   // many rows: all of them
      const selected = spec.cardinality === 'one' ? ids : all;
      // A target with no contributing row is OMITTED — never written as 0 (finding F-2).
      if (!selected.length) continue;
      fieldMap.push({ target: spec.target, op: spec.op, field_ids: selected });
      selected.forEach((id: string) => used.add(id));
    }
```

### 2.3 Correction 5 — active-status allowlist, and explicit lookup failures

```ts
/**
 * Active-status allowlist for SNAPSHOT AUTHORITY. Stricter than the platform-wide gate in
 * authenticateActor (which refuses only `suspended`): here every status that is not in this
 * list fails closed. Verified values in use are `active` and `incomplete` (V-1); the declared
 * vocabulary is unverified (V-2), so the list is deliberately conservative and lives here,
 * scoped to snapshots, rather than changing the global gate.
 */
const ACTIVE_PROFILE_STATUSES = ['active', 'incomplete'];

function assertActiveProfile(actor: any) {
  const status = actor?.profile?.profile_status;
  if (!ACTIVE_PROFILE_STATUSES.includes(String(status))) {
    throw new HttpError(403, 'Forbidden');
  }
}
```

```ts
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
  if (actor.role === 'advisor' && entity.assigned_advisor_id === actor.profile_id) return 'assigned_advisor';

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
```

Called immediately after `authenticateActor`:

```ts
    const actor = await authenticateActor(base44, sb);
    assertActiveProfile(actor);
```

### 2.4 Unchanged in the Base44 layer

The document-loading chokepoint, the 404 conflation, the 400 body checks, the 409 fail-closed rules for a document with no business/owner, the RPC parameter list (which already carries no values) and the response shape are all as in Revision 2.

---

## 3. Corrections to the proposed SQL

Replaces the corresponding blocks of Revision 2 §9.2. The function signature, `security invoker`, `search_path` pinning, `REVOKE`-then-`GRANT` block and optional indexes are unchanged — except that **two** functions now exist (§3.1, §3.2), both `service_role`-only.

### 3.1 Correction 1 — the contract becomes an authoritative, single-source declaration

```sql
-- ============================================================================
-- Phase S4 — The authoritative mapping contract. IMMUTABLE, read-only, no writes.
-- This is the SINGLE SOURCE OF TRUTH for which accepted field may feed which target.
-- The Base44 layer keeps a mirror for building its selection; the snapshot function
-- validates every entry against THIS declaration, so a mirror that drifts fails closed.
-- ============================================================================
create or replace function public.s4_mapping_contract(p_version text)
returns jsonb
language sql
immutable
security invoker
set search_path = public, pg_temp
as $fn$
  select case when p_version <> 's4.mapping.v1' then null else jsonb_build_object(
    'version','s4.mapping.v1',
    'types', jsonb_build_object(
      'profit_and_loss', jsonb_build_object('basis','book','targets', jsonb_build_array(
        jsonb_build_object('target','annual_revenue','op','direct','from','annual_revenue','cardinality','one'),
        jsonb_build_object('target','gross_profit','op','direct','from','gross_profit','cardinality','one'),
        jsonb_build_object('target','net_profit','op','direct','from','net_profit','cardinality','one'),
        jsonb_build_object('target','total_expenses','op','direct','from','total_expenses','cardinality','one'),
        jsonb_build_object('target','owner_compensation','op','direct','from','owner_compensation','cardinality','one'))),
      'balance_sheet', jsonb_build_object('basis','book','targets', jsonb_build_array(
        jsonb_build_object('target','total_assets','op','direct','from','total_assets','cardinality','one'),
        jsonb_build_object('target','cash_on_hand','op','direct','from','cash_on_hand','cardinality','one'),
        jsonb_build_object('target','total_debt','op','direct','from','total_debt','cardinality','one'),
        jsonb_build_object('target','metadata.total_equity','op','direct','from','total_equity','cardinality','one'),
        jsonb_build_object('target','metadata.total_liabilities','op','direct','from','total_liabilities','cardinality','one'))),
      'business_tax_return', jsonb_build_object('basis','tax','targets', jsonb_build_array(
        jsonb_build_object('target','annual_revenue','op','direct','from','gross_receipts','cardinality','one'),
        jsonb_build_object('target','net_profit','op','direct','from','ordinary_business_income','cardinality','one'),
        jsonb_build_object('target','owner_compensation','op','direct','from','officer_compensation','cardinality','one'),
        jsonb_build_object('target','payroll','op','direct','from','wages','cardinality','one'),
        jsonb_build_object('target','total_expenses','op','direct','from','deductions','cardinality','one'),
        jsonb_build_object('target','metadata.taxable_income','op','direct','from','taxable_income','cardinality','one'))),
      'debt_schedule', jsonb_build_object('basis','schedule','targets', jsonb_build_array(
        jsonb_build_object('target','total_debt','op','sum','from','loan_balance','cardinality','many'),
        jsonb_build_object('target','metadata.monthly_debt_payment','op','sum','from','monthly_payment','cardinality','many'),
        jsonb_build_object('target','metadata.mean_interest_rate','op','mean','from','interest_rate','cardinality','many'))),
      'payroll_report', jsonb_build_object('basis','payroll','targets', jsonb_build_array(
        jsonb_build_object('target','payroll','op','direct','from','total_payroll','cardinality','one'),
        jsonb_build_object('target','owner_compensation','op','direct','from','owner_payroll','cardinality','one'),
        jsonb_build_object('target','metadata.employee_count','op','direct','from','employee_count','cardinality','one'),
        jsonb_build_object('target','metadata.payroll_tax','op','direct','from','payroll_tax','cardinality','one'))))
  ) end;
$fn$;

revoke all on function public.s4_mapping_contract(text) from public, anon, authenticated;
grant execute on function public.s4_mapping_contract(text) to service_role;
```

### 3.2 Correction 1 — contract validation inside the snapshot function

Additions to the `declare` block:

```sql
  v_reserved_meta_keys constant text[] := array[
    'mapping_contract','basis','content_hash','provenance','created_by_base44_user_id'];
  v_active_statuses    constant text[] := array['active','incomplete'];
  v_contract   jsonb;
  v_type_spec  jsonb;
  v_spec       jsonb;
  v_nonnull    bigint;
  v_hash_input jsonb := '[]'::jsonb;
  v_persisted_metadata jsonb;
  v_dedup      boolean := false;
  v_is_latest_now boolean;
```

Replaces Revision 2 §9.2 steps 1 and 5 with the following. **Revised execution order** — the advisory lock now moves to *after* validation (§3.4), shortening the lock's hold to the mutation window only:

```sql
  -- ── 1. INPUT SHAPE ────────────────────────────────────────────────────────
  if p_business_id is null or p_source_document_id is null
     or p_actor_profile_id is null or p_mapping_version is null then
    raise exception 'SNAPSHOT_INVALID_INPUT' using errcode = '22023';
  end if;
  if jsonb_typeof(p_field_map) <> 'array' or p_field_map = '[]'::jsonb then
    raise exception 'SNAPSHOT_INVALID_INPUT' using errcode = '22023';
  end if;
  if p_snapshot_type is not null
     and p_snapshot_type not in ('historical','tax_year','projected') then
    raise exception 'SNAPSHOT_INVALID_TYPE' using errcode = '22023';
  end if;

  -- ── 2. TENANT (unchanged) ─────────────────────────────────────────────────
  --  … document read, business match, as in Revision 2 …

  -- ── 3. ACTOR PROFILE, ACTIVE STATUS, AUTHORIZED RELATIONSHIP ──────────────
  select p.app_role, p.profile_status into v_role, v_status
    from public.profiles p where p.id = p_actor_profile_id;

  if v_role is null then
    raise exception 'SNAPSHOT_ACTOR_UNKNOWN' using errcode = '42501';
  end if;
  -- FAIL CLOSED on every status that is not explicitly active.
  if not (v_status = any (v_active_statuses)) then
    raise exception 'SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE' using errcode = '42501';
  end if;
  --  … relationship checks exactly as in Revision 2 …
  --
  -- NO EXCEPTION IS CAUGHT ANYWHERE IN THIS FUNCTION. A failed authorization lookup raises
  -- and aborts the transaction; it is never converted into an "unauthorized" verdict, and
  -- never into a successful write.

  -- ── 4. CONTRACT ENFORCEMENT — the database is the authority ───────────────
  v_contract := public.s4_mapping_contract(p_mapping_version);
  if v_contract is null then
    raise exception 'SNAPSHOT_MAPPING_VERSION_UNSUPPORTED' using errcode = '22023';
  end if;

  v_type_spec := v_contract->'types'->v_doc_type;              -- type read from documents
  if v_type_spec is null then
    raise exception 'SNAPSHOT_DOCUMENT_TYPE_UNSUPPORTED' using errcode = '22023';
  end if;
  if p_basis is distinct from v_type_spec->>'basis' then
    raise exception 'SNAPSHOT_BASIS_MISMATCH' using errcode = '22023';
  end if;

  -- no target may appear twice
  if (select count(*) from jsonb_array_elements(p_field_map)) <>
     (select count(distinct e->>'target') from jsonb_array_elements(p_field_map) e) then
    raise exception 'SNAPSHOT_DUPLICATE_TARGET' using errcode = '22023';
  end if;

  -- every target must be declared by THIS document type's contract
  if exists (
    select 1 from jsonb_array_elements(p_field_map) e
     where not exists (
       select 1 from jsonb_array_elements(v_type_spec->'targets') t
        where t->>'target' = e->>'target')
  ) then
    raise exception 'SNAPSHOT_TARGET_NOT_IN_CONTRACT' using errcode = '22023';
  end if;

  -- no field id may feed two targets
  if (select count(*) from jsonb_array_elements(p_field_map) e,
                          jsonb_array_elements_text(e->'field_ids') f) <>
     (select count(distinct f) from jsonb_array_elements(p_field_map) e,
                                  jsonb_array_elements_text(e->'field_ids') f) then
    raise exception 'SNAPSHOT_DUPLICATE_FIELD' using errcode = '22023';
  end if;

  -- ── 5. VALUES — iterated in CONTRACT order, never in caller order ─────────
  for v_spec in select * from jsonb_array_elements(v_type_spec->'targets') loop
    v_target := v_spec->>'target';

    if v_target = any (v_reserved_meta_keys) then
      raise exception 'SNAPSHOT_RESERVED_METADATA_KEY' using errcode = '22023';
    end if;
    if left(v_target, 9) <> 'metadata.' and not (v_target = any (v_metric_columns)) then
      raise exception 'SNAPSHOT_INVALID_TARGET' using errcode = '22023';
    end if;

    select e into v_entry from jsonb_array_elements(p_field_map) e
     where e->>'target' = v_target;
    if v_entry is null then continue; end if;                 -- optional target not supplied

    -- the operation must be the contract's operation for this target
    if coalesce(v_entry->>'op','') <> v_spec->>'op' then
      raise exception 'SNAPSHOT_OP_MISMATCH' using errcode = '22023';
    end if;

    select array_agg(x::uuid order by x) into v_ids
      from jsonb_array_elements_text(v_entry->'field_ids') x;
    v_requested := array_length(v_ids, 1);
    if v_requested is null then
      raise exception 'SNAPSHOT_INVALID_TARGET' using errcode = '22023';
    end if;
    if v_spec->>'cardinality' = 'one' and v_requested <> 1 then
      raise exception 'SNAPSHOT_CARDINALITY_VIOLATION' using errcode = '22023';
    end if;

    -- EVERY contributing row must be: an accepted/corrected field of THIS document AND this
    -- business, AND carry the contract's source field_name, AND hold a non-NULL value.
    -- The field_name test is what makes substitution impossible: a row named `total_expenses`
    -- can never feed `annual_revenue`, because that target's contract says `from` = 'annual_revenue'.
    select count(*), count(f.accepted_normalized_value), sum(f.accepted_normalized_value)
      into v_found, v_nonnull, v_total
      from public.extracted_fields f
     where f.id = any (v_ids)
       and f.document_id = p_source_document_id
       and f.business_id = p_business_id
       and f.review_status in ('accepted','corrected')
       and f.field_name = v_spec->>'from';

    if coalesce(v_found, 0) <> v_requested then
      raise exception 'SNAPSHOT_FIELD_NOT_CONTRACTED' using errcode = '42501';
    end if;
    -- A NULL contributor is refused outright. `sum()` would silently skip it and return a
    -- total over fewer rows than were delivered — an unknown presented as a complete figure.
    if v_nonnull <> v_requested then
      raise exception 'SNAPSHOT_FIELD_VALUE_MISSING' using errcode = '22023';
    end if;

    if v_spec->>'op' = 'mean' then
      v_value := round(v_total / v_requested, 6);
    else
      v_value := v_total;                                    -- direct and sum: every row non-NULL
    end if;

    if left(v_target, 9) = 'metadata.' then
      v_meta_metrics := jsonb_set(v_meta_metrics, array[substr(v_target, 10)],
                                  to_jsonb(v_value), true);
    else
      v_metrics := jsonb_set(v_metrics, array[v_target], to_jsonb(v_value), true);
    end if;

    v_provenance := jsonb_set(v_provenance, array[v_target],
      jsonb_build_object('op', v_spec->>'op', 'from', v_spec->>'from',
                         'field_ids', to_jsonb(v_ids)), true);
    -- Fingerprint accumulates in CONTRACT order, so a reordered selection cannot change it.
    v_hash_input := v_hash_input
                 || jsonb_build_array(jsonb_build_object('t', v_target, 'v', v_value));
  end loop;
```

### 3.3 Correction 2 — metadata keys: exact extraction, reserved keys, and a persistence assertion

```sql
    -- Target keys are extracted with substr(v_target, 10) — the exact remainder after the
    -- literal 'metadata.' — rather than by character counting. Each approved key therefore
    -- persists under its intended name: total_liabilities, mean_interest_rate, total_equity,
    -- taxable_income, monthly_debt_payment, employee_count, payroll_tax.
```

Reserved-key collisions are impossible because the validation in §3.2 rejects any target in `v_reserved_meta_keys`, and because the insert writes the reserved block by explicit key. The insert now verifies what it wrote:

```sql
  insert into public.business_metric_snapshots (
    profile_id, business_id, snapshot_type, snapshot_date,
    annual_revenue, gross_profit, net_profit, total_expenses, owner_compensation,
    payroll, total_debt, cash_on_hand, total_assets,
    metadata, data_source, source_document_id, data_confidence_score, is_latest, created_by
  )
  values ( … as in Revision 2 … )
  returning id, metadata into v_snapshot_id, v_persisted_metadata;

  -- Verify the metric metadata persisted under its EXACT keys and values, not merely that
  -- the column is non-null. `@>` is jsonb containment: every key in v_meta_metrics must be
  -- present in the stored row with an equal value.
  if v_persisted_metadata is null or not (v_persisted_metadata @> v_meta_metrics) then
    raise exception 'SNAPSHOT_METADATA_LOST' using errcode = '22023';
  end if;
  if (v_persisted_metadata->>'total_liabilities')
     is distinct from (v_meta_metrics->>'total_liabilities') then
    raise exception 'SNAPSHOT_METADATA_LOST' using errcode = '22023';
  end if;
```

### 3.4 Corrections 3 and 4 — idempotency, hash definition, and side effects that are never skipped

```sql
  -- ── 6. DERIVED FIELDS (resolved BEFORE hashing, because they are part of it) ──
  v_snapshot_date := case when v_doc_year is not null
                          then make_date(v_doc_year, 12, 31) else current_date end;
  v_snapshot_type := coalesce(p_snapshot_type,
    case when v_doc_type in ('business_tax_return','personal_tax_return')
         then 'tax_year' else 'historical' end);

  select avg(f.confidence_score::numeric) into v_confidence
    from public.extracted_fields f
   where f.document_id = p_source_document_id
     and f.business_id = p_business_id
     and f.review_status in ('accepted','corrected');

  -- ── 7. CONTENT HASH — canonical jsonb text, so ordering cannot alter it ───────
  -- Covers: document, mapping version, document type, RESOLVED snapshot type, basis, and the
  -- contract-ordered values. It deliberately does NOT cover isLatest or updateDashboard:
  -- those are SIDE EFFECTS of a request, not part of what the snapshot contains.
  v_content_hash := md5(jsonb_build_object(
    'document',        p_source_document_id,
    'mapping_version', p_mapping_version,
    'document_type',   v_doc_type,
    'snapshot_type',   v_snapshot_type,
    'basis',           p_basis,
    'values',          v_hash_input
  )::text);

  -- ── 8. ADVISORY LOCK — held only across the lookup and the writes ─────────────
  perform pg_advisory_xact_lock(hashtextextended('s4:snapshot:' || p_business_id::text, 0));

  select id, snapshot_type, is_latest, data_confidence_score
    into v_existing, v_existing_type, v_existing_latest, v_existing_confidence
    from public.business_metric_snapshots
   where business_id = p_business_id
     and metadata->>'content_hash' = v_content_hash
   limit 1;

  if v_existing is not null then
    -- Same hash ⇒ same document, version, type and values by construction. Assert it rather
    -- than assume it: a divergence means either the hash or the stored row is wrong.
    if v_existing_type is distinct from v_snapshot_type then
      raise exception 'SNAPSHOT_DEDUPE_TYPE_MISMATCH' using errcode = '22023';
    end if;
    v_snapshot_id := v_existing;
    v_dedup := true;
  else
    insert into public.business_metric_snapshots ( … as in §3.3, is_latest = false … )
    returning id, metadata into v_snapshot_id, v_persisted_metadata;

    if v_persisted_metadata is null or not (v_persisted_metadata @> v_meta_metrics) then
      raise exception 'SNAPSHOT_METADATA_LOST' using errcode = '22023';
    end if;
  end if;

  -- ── 9. SIDE EFFECTS — applied on BOTH paths, so a duplicate never skips one ──
  if coalesce(p_is_latest, false) then
    update public.business_metric_snapshots
       set is_latest = false
     where business_id = p_business_id and id <> v_snapshot_id and is_latest = true;
    update public.business_metric_snapshots
       set is_latest = true
     where id = v_snapshot_id;
    v_is_latest_now := true;
  elsif v_dedup then
    v_is_latest_now := coalesce(v_existing_latest, false);
  else
    v_is_latest_now := false;
  end if;

  if coalesce(p_update_dashboard, false)
     and (v_metrics ? 'annual_revenue' or v_metrics ? 'net_profit') then
    update public.dashboard_metrics
       set annual_revenue = coalesce((v_metrics->>'annual_revenue')::numeric, annual_revenue),
           net_profit     = coalesce((v_metrics->>'net_profit')::numeric, net_profit),
           updated_at     = clock_timestamp()
     where business_id = p_business_id;

    if not found then
      insert into public.dashboard_metrics
        (business_id, annual_revenue, net_profit, created_at, updated_at)
      values (p_business_id, (v_metrics->>'annual_revenue')::numeric,
              (v_metrics->>'net_profit')::numeric, clock_timestamp(), clock_timestamp());
    end if;
    v_dashboard_done := true;
  end if;

  return jsonb_build_object(
    'snapshot_id',               v_snapshot_id,
    'deduplicated',              v_dedup,
    'dashboard_metrics_updated', v_dashboard_done,
    'snapshot_type',             coalesce(v_existing_type, v_snapshot_type),
    'is_latest',                 v_is_latest_now,
    'applied',                   v_metrics || v_meta_metrics,
    'skipped',                   coalesce(p_skipped, '[]'::jsonb),
    -- For a duplicate, the STORED row's confidence is returned, not null.
    'confidence_score',          coalesce(v_existing_confidence, round(v_confidence, 2))
  );
```

### 3.5 Behaviour definition — what makes two requests "the same"

| Request varies | In the content hash? | Result |
|---|---|---|
| Document contents (accepted field values change) | **Yes** (values) | New snapshot |
| Mapping version | **Yes** | New snapshot — provenance records the new contract |
| Document type | **Yes** | New snapshot |
| **`snapshot_type`** | **Yes** (resolved) | Different type ⇒ different snapshot. Same type ⇒ dedupe |
| **`isLatest`** | **No** — a side effect | Duplicate promotes the existing row when requested; no new row |
| **`updateDashboard`** | **No** — a side effect | Duplicate **performs** the dashboard update and reports `dashboard_metrics_updated: true`; never silently skipped |
| Selection order (same ids) | **No** — contract-ordered | Same hash ⇒ duplicate |

### 3.6 Access control for the second function

`REVOKE`/`GRANT` as in §3.1; the snapshot function's own grant block from Revision 2 §9.2 step 11 is unchanged. Both functions are `service_role`-only.

---

## 4. Correction 5 — status vocabulary, stated precisely

| | |
|---|---|
| **Verified values in use** | `active` (1), `incomplete` (7); no NULLs; 8/8 of all profiles accounted for (V-1) |
| **Declared vocabulary** | **UNVERIFIED.** No check constraint exists in any migration in this repository, and the only code reference is an equality test against `suspended` (V-2) |
| **Rule adopted** | Explicit allowlist `('active','incomplete')`; **every other value fails closed**, including any value not yet observed |
| **Scope** | Applied **locally** in the snapshot path (Base44 `assertActiveProfile` + the RPC's `v_active_statuses`). The platform-wide gate in `authenticateActor` is **not** changed, so no other feature's behaviour moves |
| **Gate B obligation** | Confirm the declared set — `pg_constraint` for a check on `profiles.profile_status` — before the function is finalized; if a legitimate status exists outside the allowlist, add it then |

**Lookup errors are never verdicts.** Both layers treat a failed authorization query as infrastructure failure: Base44 logs and returns 500; the RPC catches nothing, so the exception aborts the transaction. Neither path converts an error into a denial, and neither falls through to a write.

---

## 5. Correction 6 — D-4 and D-13 remain conditional

### D-4 — advisor assignment and revocation

| Evidence | |
|---|---|
| The column is the certified pattern | `business_entities.assigned_advisor_id`, used as the access rule by `writeGuard`, `decisionIntelligenceService` (which explicitly rejects `advisor_assignments`), `valuationAuth`, `valuationShared`, `expertAdvisorAccess`, `documentAssignments`, `supabaseUserData` |
| **No writer exists in this repository** | Every reference is a read (V-5) |
| **Nothing is assigned today** | 0 of 9 businesses (V-4) |
| Revocation mechanism | **UNVERIFIED** — `business_entities` has no revocation column, so revocation appears to be clearing the value outside the codebase |

**Gate B verification protocol:** (a) read `pg_constraint` for any constraint or trigger on `assigned_advisor_id`; (b) locate the actual writer (admin UI, manual SQL) and confirm clearing is the revocation path; (c) run a stale-assignment probe — businesses whose `assigned_advisor_id` names a profile whose status is outside `('active','incomplete')`; (d) if revocation cannot be evidenced, keep the advisor branch **off** until it can.

**Status: conditional.** The proposal's advisor branch is unchanged but must be treated as unexercised.

### D-13 — `created_by` reference semantics

| Evidence | |
|---|---|
| Type | `uuid` (verified Revision 2) |
| Only writer in the repository | This function (V-7) |
| FK target | **Unverifiable without SQL** |

**Branch A — FK to `profiles(id)`:** `created_by = p_actor_profile_id`. As proposed.
**Branch B — FK to anything else, or no FK:** still pass the canonical profile UUID (the only identifier here that is genuinely a UUID), or pass `NULL` and rely on `metadata.created_by_base44_user_id`. Decided at Gate B.

**Gate B query:** `pg_constraint` / `pg_depend` on `business_metric_snapshots` for the referenced table of `created_by`, plus a sample of non-null values to see which id space they occupy.

**Status: conditional.** The metadata attribution key is unaffected and ships either way.

---

## 6. Corrections 1–7 — smallest safe correction and layer

| # | Correction | Base44 | Supabase |
|---|---|---|---|
| 1 | Contract enforced in the RPC: version, document type, target, source `field_name`, op, cardinality, duplicate target, duplicate field id | mirror only | **authoritative** (`s4_mapping_contract` + validation) |
| 2 | Metadata keys: exact `substr` extraction, reserved-key rejection, post-insert `@>` persistence assertion | — | ✔ |
| 3 | Idempotency redesigned; side effects applied on both paths; duplicate returns stored details | ✔ (surfaces `deduplicated`) | ✔ |
| 4 | Deterministic ordering, contract-ordered provenance and hashing, NULL-contributor refusal | ✔ | ✔ |
| 5 | Active-status allowlist + explicit lookup-error handling | ✔ | ✔ |
| 6 | D-4 and D-13 evidence and verification protocol | — | ✔ (verification only) |
| 7 | Focused tests | ✔ | ✔ |

---

## 7. Correction 7 — focused tests for each correction

| # | Test | Asserts |
|---|---|---|
| **T-1** | **Contract parity** — compare the Base44 `FIELD_CONTRACT` with `public.s4_mapping_contract('s4.mapping.v1')` | Identical declarations; a deliberate drift makes the next test fail rather than a snapshot |
| **T-2** | **Manipulated target→field mapping**: `annual_revenue` fed by an accepted `total_expenses` row | `SNAPSHOT_FIELD_NOT_CONTRACTED`; zero writes |
| **T-3** | Arbitrary metadata target (`metadata.net_worth`, `metadata.mapping_contract`, `metadata.provenance`) | `SNAPSHOT_TARGET_NOT_IN_CONTRACT` / `SNAPSHOT_RESERVED_METADATA_KEY`; zero writes |
| **T-4** | Wrong `op` for a target (`sum` on `annual_revenue`); `direct` with two ids; `sum` with one id | `SNAPSHOT_OP_MISMATCH` / `SNAPSHOT_CARDINALITY_VIOLATION` |
| **T-5** | Unknown mapping version; unknown document type; basis that contradicts the contract | The three matching exceptions |
| **T-6** | **Metadata persistence** — balance sheet with `total_equity` and `total_liabilities`; debt schedule with `mean_interest_rate` | Stored under those exact keys with equal values; `@>` assertion passes; no `weighted_interest_rate` key |
| **T-7** | Forced metadata loss (test fixture) | `SNAPSHOT_METADATA_LOST`; transaction rolled back |
| **T-8** | **Duplicate with different options** — same content sent twice, second with `updateDashboard=true` | One snapshot; `deduplicated: true`; `dashboard_metrics_updated: true` (not silently skipped); `snapshot_id`, `snapshot_type`, `confidence_score` returned from the stored row and non-null |
| **T-9** | **Duplicate differing by `snapshot_type`** | Two snapshots; each hash distinct |
| **T-10** | **Duplicate with `isLatest=true`** after the first was demoted | Promoted; exactly one `is_latest` row; no new snapshot |
| **T-11** | **Reordered selections** — the same field ids delivered in a different array order | Identical content hash; `deduplicated: true`; identical provenance |
| **T-12** | **NULL in an aggregate** — one `loan_balance` row present, one with a NULL `accepted_normalized_value` | `SNAPSHOT_FIELD_VALUE_MISSING`; **no** partial total; zero writes |
| **T-13** | `direct` target whose value is NULL | `SNAPSHOT_FIELD_VALUE_MISSING` |
| **T-14** | Duplicate field id across two targets; duplicate target in the array | `SNAPSHOT_DUPLICATE_FIELD` / `SNAPSHOT_DUPLICATE_TARGET` |
| **T-15** | Repeated `field_name` (two accepted `annual_revenue` rows, different `reviewed_at`) | The later `reviewed_at` wins, deterministically, across repeated runs |
| **T-16** | **Suspended advisor who is assigned**; profiles with each non-active status | Refused (`SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE`; Base44 403 before the RPC) |
| **T-17** | **Authorization lookup failure** (fixture forcing a query error on `business_entities`/`business_owners`) | Base44 returns **500**, not 403/404; the RPC aborts with no write |
| **T-18** | Forged actor id in the body; direct RPC call with the wrong `p_actor_profile_id` | Ignored / `SNAPSHOT_FORBIDDEN`; zero writes (carried from Revision 2) |

Tests T-1…T-15 belong in the CB-style scripted suite; T-16…T-18 in the adversarial set already planned in Revision 2 §12.

---

## 8. Unchanged

- **D-1, D-2, D-3, D-5 (withdrawn), D-6, D-7, D-8, D-10, D-11, D-12** — preserved exactly as approved.
- **D-4, D-9, D-13** — conditional (D-9's design is now fully specified in §3.5; its approval remains yours).
- The trust-boundary statement, the seven-row authorization table, the financial mapping audit, source integrity, the rollback order, the risk register, and the Revision 2 test plan — all unchanged.

---

## 9. Gate status

**Gate A — Revision 3.** Review §2 (Base44 deltas), §3 (SQL deltas), §3.5 (idempotency definition), §4 (status rule), §5 (conditional D-4/D-13), §7 (tests). **Nothing applied.**

**Gate B — not authorized.** On approval: run the Revision 2 §9.6 read-only verification (plus the §4 and §5 protocol queries) → create the migration (two functions) → apply to an isolated environment → implement the Base44 file → run §7 and Revision 2 §12 → report. Production remains a separate decision.

**Awaiting:** approval of §2 and §3, and your rulings on the conditional **D-4**, **D-9** and **D-13**.