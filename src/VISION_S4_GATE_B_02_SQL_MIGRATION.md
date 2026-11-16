# S4 Gate B · DELIVERABLE 2 of 4 — Consolidated SQL Migration
## PROPOSAL — **NOT APPLIED** · apply ONLY to the **existing shared test project** (`xrvahykvkuiuglskmctd`), which is **not an isolated project**, inside a synthetic-only write boundary (plan §2) — never to production

**Supersedes** the SQL of Revision 5, 5.1, 5.2 and the final reconciliation. Where they disagreed, **this is the resolved text.**
**Objects:** two functions and one table, plus **one transaction-scoped guard block that creates nothing** (§3, below the access control). **Additive.** No table, column, policy, index or data is modified. No CB-005A, CB-005B, provider, Galileo or Digital Twin object is touched.

**The transaction guard is now part of this migration.** The `S4_ACL_GUARD_FAILED` block is the **final statement of the script**, inside the same transaction, after every `REVOKE`/`GRANT`. It is archived **here** and nowhere else: `VISION_S4_GATE_B_EXECUTION_SAFETY_PLAN.md` cites this file as the single authoritative migration and no longer carries a copy. A failed assertion raises, the raise aborts the transaction, and the objects never survive a wrong ACL.

**Final safety correction incorporated:** the confidence calculation no longer relies on a regex and a cast in separate `WHERE` predicates whose evaluation order PostgreSQL does not guarantee. It is a single guarded `CASE` — the format and length guards are **separate `WHEN` arms** (so their order *is* guaranteed), the input length is bounded **including decimal digits** before any conversion, and the one conversion sits in the `ELSE`, reachable only for a row that passed every guard. The same guard is used by the monitoring query in §5.

**Revision — two corrections added (documentation only, nothing executed).** (i) **`p_field_map` and `p_skipped` are now validated deterministically and fail-closed** *before* any contract lookup or financial processing — object type, allowed keys, uuid formatting, array structure and the op vocabulary — so malformed input raises a **named** error and can never reach a cast (§3 step 1.1, §3.2). (ii) **The actor boundary this function cannot cross is stated explicitly** (§3.3), because `service_role` is database capability and never end-user identity; the Base44 caller is responsible for establishing the session actor, and the **deployed caller does not yet do so** — see the source-inspection finding in `VISION_S4_GATE_B_EXECUTION_SAFETY_PLAN.md` §5.5. Contract and cardinality behaviour are unchanged.

---

## 1. The authoritative mapping contract (immutable, read-only)

```sql
-- ============================================================================
-- Phase S4 — the authoritative mapping contract. IMMUTABLE, read-only, no writes.
-- SINGLE SOURCE OF TRUTH for which accepted field may feed which target. The Base44 layer keeps
-- a mirror for building its selection; this function validates every entry against THIS
-- declaration, so a mirror that drifts FAILS CLOSED — it can never produce a wrong value.
-- ============================================================================
create or replace function public.s4_mapping_contract(p_version text)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
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

revoke all on function public.s4_mapping_contract(text) from public;
revoke all on function public.s4_mapping_contract(text) from anon, authenticated;
grant execute on function public.s4_mapping_contract(text) to service_role;

comment on function public.s4_mapping_contract(text) is
'Phase S4: the authoritative, immutable mapping contract for reviewed-fields snapshots. Read-only. service_role only.';
```

---

## 2. The append-only submission audit

```sql
-- ── APPEND-ONLY SUBMISSION AUDIT ───────────────────────────────────────────
-- Records EVERY accepted submission, including a deduplicated one, so attribution survives a
-- content-hash dedupe without mutating the snapshot row and WITHOUT entering the content hash.
-- Append-only in practice: RESTRICT on every reference, and business_metric_snapshots carries no
-- DELETE policy. Naming follows the deployed precedent public.provider_operation_audit.
--
-- TRUST BOUNDARY: actor_profile_id is the actor the SERVICE-ROLE CALLER CLAIMED, validated by
-- this migration only as a RELATIONSHIP (profile exists, status active, related to the business).
-- It is not proof of which end user initiated the call. Never describe it as verified authorship.
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

create index idx_ssa_snapshot on public.snapshot_submission_audit (snapshot_id);
create index idx_ssa_hash     on public.snapshot_submission_audit (content_hash);

-- A NEW table in public inherits arwdDxtm for anon/authenticated from pg_default_acl, so both the
-- deny-all policy posture AND the explicit revoke are required.
alter table public.snapshot_submission_audit enable row level security;   -- zero policies: deny-all
revoke all on table public.snapshot_submission_audit from public;
revoke all on table public.snapshot_submission_audit from anon, authenticated;
grant select, insert on table public.snapshot_submission_audit to service_role;

comment on table public.snapshot_submission_audit is
'Phase S4: append-only record of every accepted snapshot submission (including deduplicated ones). service_role only. Never part of the snapshot content hash. actor_profile_id is a CLAIM validated as a relationship, not proof of caller identity.';
```

---

## 3. The snapshot function (complete)

```sql
create or replace function public.create_reviewed_fields_snapshot(
  p_business_id           uuid,
  p_source_document_id    uuid,
  p_actor_profile_id      uuid,
  p_actor_base44_user_id  text,
  p_mapping_version       text,
  p_basis                 text,
  p_snapshot_type         text,
  p_field_map             jsonb,
  p_skipped               jsonb,
  p_is_latest             boolean,
  p_update_dashboard      boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_metric_columns constant text[] := array[
    'annual_revenue','gross_profit','net_profit','total_expenses','owner_compensation',
    'payroll','total_debt','cash_on_hand','total_assets'];
  v_reserved_meta_keys constant text[] := array[
    'mapping_contract','basis','content_hash','provenance','created_by_base44_user_id'];
  v_active_statuses constant text[] := array['active','incomplete'];
  v_advisor_authority_enabled     constant boolean := false;      -- D-4: disabled in BOTH layers
  v_dashboard_projection_enabled  constant boolean := false;      -- D-19: disabled in BOTH layers
  v_min_year constant integer := 1900;
  v_max_year constant integer := 2100;

  -- CONFIDENCE GUARD. The scale is 0–100 (established from the deployed data: 80 scored rows,
  -- integers 76–96; business_metric_snapshots.data_confidence_score 0–95; the platform's entity
  -- schemas all say "0-100"). A value is usable only if it is short, formatted as digits with an
  -- optional fractional part, and within the scale.
  --   · length cap 16 — bounds the TOTAL input, padding and decimal digits included, so an
  --     exceptionally long numeric string can never reach the conversion;
  --   · the pattern allows at most 3 integer and 4 fractional digits;
  --   · both guards are SEPARATE `when` arms, so their evaluation order IS guaranteed — unlike
  --     `and`-joined predicates, whose order PostgreSQL does not promise.
  v_conf_max_len constant integer := 16;
  v_conf_pattern constant text := '^[[:space:]]*[0-9]{1,3}(\.[0-9]{1,4})?[[:space:]]*$';

  v_doc_business   uuid;
  v_doc_profile    uuid;
  v_doc_type       text;
  v_doc_year       integer;
  v_role           text;
  v_status         text;
  v_is_admin       boolean;
  v_authorized     boolean := false;
  v_entity         record;
  v_contract       jsonb;
  v_type_spec      jsonb;
  v_spec           jsonb;
  v_entry          jsonb;
  v_target         text;
  v_meta_key       text;
  v_ids            uuid[];
  v_requested      integer;
  v_found          integer;
  v_nonnull        bigint;
  v_total          numeric;
  v_value          numeric;
  v_metrics        jsonb := '{}'::jsonb;
  v_meta_metrics   jsonb := '{}'::jsonb;
  v_provenance     jsonb := '{}'::jsonb;
  v_source_scores  jsonb;
  v_hash_input     jsonb := '[]'::jsonb;
  v_source_input   jsonb := '[]'::jsonb;
  v_contributor_ids   uuid[];
  v_contributor_count integer;
  v_scored_count      integer;
  v_confidence        numeric;
  v_confidence_stored numeric;
  v_content_hash   text;
  v_existing       uuid;
  v_existing_type  text;
  v_existing_latest boolean;
  v_existing_confidence numeric;
  v_snapshot_date  date;
  v_snapshot_type  text;
  v_snapshot_id    uuid;
  v_persisted_metadata   jsonb;
  v_persisted_date       date;
  v_persisted_confidence numeric;
  v_persisted_created_by uuid;
  v_dedup          boolean := false;
  v_is_latest_now  boolean := false;
  v_dashboard_done boolean := false;
  v_dashboard_skip text;
  v_previous_latest_date date;
  v_promoted_over_newer  boolean := false;
begin
  -- ── 1. INPUT SHAPE ────────────────────────────────────────────────────────
  if p_business_id is null or p_source_document_id is null
     or p_actor_profile_id is null or p_mapping_version is null then
    raise exception 'SNAPSHOT_INVALID_INPUT' using errcode = '22023';
  end if;
  if jsonb_typeof(p_field_map) <> 'array' or p_field_map = '[]'::jsonb then
    raise exception 'SNAPSHOT_INVALID_INPUT' using errcode = '22023';
  end if;
  -- 'projection' — the DEPLOYED value ('projected' is not permitted by
  -- business_metric_snapshots_snapshot_type_check).
  if p_snapshot_type is not null
     and p_snapshot_type not in ('historical','tax_year','projection') then
    raise exception 'SNAPSHOT_INVALID_TYPE' using errcode = '22023';
  end if;

  -- ── 1.1 p_field_map / p_skipped — DETERMINISTIC, FAIL-CLOSED SHAPE CHECK ───
  -- Runs BEFORE the contract lookup, before any business or document read past the
  -- identity of the document, and before ANY financial processing. Every branch raises
  -- a NAMED error, and no cast is reachable from unvalidated input — so a malformed
  -- delivery can never surface as a generic PostgreSQL 22P02/22023 raised by the
  -- conversion itself. Nothing here coerces or quietly ignores: an unexpected key, a
  -- non-object entry, a non-array field_ids, a malformed uuid or an unknown op is
  -- refused.
  -- These are SEPARATE statements, so their execution order is guaranteed (unlike the
  -- evaluation order of OR-joined predicates inside one statement, which PostgreSQL
  -- does not promise). Each check therefore only ever sees input the previous one
  -- already proved well-typed.
  if exists (
    select 1 from jsonb_array_elements(p_field_map) e
     where jsonb_typeof(e) <> 'object'
  ) then
    raise exception 'SNAPSHOT_INVALID_FIELD_MAP: entry is not an object' using errcode = '22023';
  end if;

  -- ALLOWED KEYS ONLY. A caller-supplied `value` / `accepted_normalized_value` key is
  -- refused here rather than silently ignored, so "values never come from the caller"
  -- is enforced at the boundary instead of merely being true further down.
  if exists (
    select 1 from jsonb_array_elements(p_field_map) e, jsonb_object_keys(e) k
     where k not in ('target','op','field_ids')
  ) then
    raise exception 'SNAPSHOT_INVALID_FIELD_MAP: entry carries a key outside (target, op, field_ids)'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_field_map) e
     where jsonb_typeof(e->'target') is distinct from 'string'
        or length(e->>'target') not between 1 and 128
  ) then
    raise exception 'SNAPSHOT_INVALID_FIELD_MAP: target must be a non-empty string' using errcode = '22023';
  end if;

  -- OPERATION VOCABULARY. The code is the one the per-target comparison already raises
  -- (SNAPSHOT_OP_MISMATCH, T-306), so a wrong op is refused at the boundary with its
  -- documented expectation unchanged. This checks only membership of the declared
  -- vocabulary; WHICH op a given target may use is still decided by the contract at
  -- step 6, and that check is not weakened or moved.
  if exists (
    select 1 from jsonb_array_elements(p_field_map) e
     where coalesce(e->>'op','') not in ('direct','sum','mean')
  ) then
    raise exception 'SNAPSHOT_OP_MISMATCH: op is not one of (direct, sum, mean)' using errcode = '22023';
  end if;

  -- field_ids: an ARRAY (emptiness is deliberately NOT rejected here — the empty-array
  -- verdict stays at step 6, where T-306 expects SNAPSHOT_INVALID_TARGET and where the
  -- contract-order rule decides it).
  if exists (
    select 1 from jsonb_array_elements(p_field_map) e
     where jsonb_typeof(e->'field_ids') is distinct from 'array'
  ) then
    raise exception 'SNAPSHOT_INVALID_FIELD_MAP: field_ids must be an array' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_field_map) e,
                  jsonb_array_elements(e->'field_ids') f
     where jsonb_typeof(f) is distinct from 'string'
  ) then
    raise exception 'SNAPSHOT_INVALID_FIELD_MAP: every field_ids element must be a string'
      using errcode = '22023';
  end if;

  -- UUID FORMAT. Canonical 8-4-4-4-12 hex, exactly 36 characters. This is what stops
  -- `x::uuid` at step 6 from raising 22P02 on hostile input: a malformed id is refused
  -- here by name, before the aggregate that casts it is ever reached.
  if exists (
    select 1 from jsonb_array_elements(p_field_map) e,
                  jsonb_array_elements(e->'field_ids') f
     where length(f #>> '{}') <> 36
        or (f #>> '{}') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) then
    raise exception 'SNAPSHOT_INVALID_FIELD_MAP: field id is not a canonical uuid' using errcode = '22023';
  end if;

  -- p_skipped: the caller's own account of what it did not send. It is ECHOED BACK in
  -- the response, so it is validated rather than trusted: null or an array of objects
  -- carrying only `field` (required, non-empty) and `reason` (optional, string), with a
  -- bounded length. Duplicate `field` values are refused — a skip list that names the
  -- same field twice is a caller defect, not a fact to publish.
  if p_skipped is not null then
    if jsonb_typeof(p_skipped) <> 'array' then
      raise exception 'SNAPSHOT_INVALID_SKIPPED: p_skipped must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_skipped) > 1000 then
      raise exception 'SNAPSHOT_INVALID_SKIPPED: too many entries' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_skipped) s where jsonb_typeof(s) <> 'object'
    ) then
      raise exception 'SNAPSHOT_INVALID_SKIPPED: entry is not an object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_skipped) s, jsonb_object_keys(s) k
       where k not in ('field','reason')
    ) then
      raise exception 'SNAPSHOT_INVALID_SKIPPED: entry carries a key outside (field, reason)'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_skipped) s
       where jsonb_typeof(s->'field') is distinct from 'string'
          or length(s->>'field') not between 1 and 128
    ) then
      raise exception 'SNAPSHOT_INVALID_SKIPPED: field must be a non-empty string' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_skipped) s
       where s ? 'reason' and jsonb_typeof(s->'reason') is distinct from 'string'
    ) then
      raise exception 'SNAPSHOT_INVALID_SKIPPED: reason must be a string' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_array_elements(p_skipped) s) <>
       (select count(distinct s->>'field') from jsonb_array_elements(p_skipped) s) then
      raise exception 'SNAPSHOT_INVALID_SKIPPED: duplicate field entry' using errcode = '22023';
    end if;
  end if;

  -- ── 2. TENANT RE-DERIVED FROM PERSISTED ROWS ──────────────────────────────
  select d.business_id, d.profile_id, d.document_type, d.year
    into v_doc_business, v_doc_profile, v_doc_type, v_doc_year
    from public.documents d
   where d.id = p_source_document_id;

  if v_doc_business is null or v_doc_business <> p_business_id then
    raise exception 'SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH' using errcode = '42501';
  end if;

  -- ── 3. REPORTING YEAR — REQUIRED. No CURRENT_DATE fallback (D-17). ────────
  -- A snapshot is dated by its document's own period, never by the day it was created, so the
  -- date stays part of a stable content identity. The range check also prevents a make_date
  -- overflow (22008) from a corrupt year.
  if v_doc_year is null then
    raise exception 'SNAPSHOT_YEAR_REQUIRED' using errcode = '22023';
  end if;
  if v_doc_year < v_min_year or v_doc_year > v_max_year then
    raise exception 'SNAPSHOT_YEAR_IMPLAUSIBLE' using errcode = '22023';
  end if;

  -- ── 4. ACTOR PROFILE, ACTIVE STATUS, AUTHORIZED RELATIONSHIP ──────────────
  -- A RELATIONSHIP, not identity. NO EXCEPTION IS CAUGHT ANYWHERE IN THIS FUNCTION: a failed
  -- authorization lookup aborts the transaction rather than becoming an "unauthorized" verdict.
  select p.app_role, p.profile_status into v_role, v_status
    from public.profiles p where p.id = p_actor_profile_id;

  if v_role is null then
    raise exception 'SNAPSHOT_ACTOR_UNKNOWN' using errcode = '42501';
  end if;
  -- FAIL CLOSED on every status that is not explicitly active. `invited` and `suspended` denied;
  -- any unobserved value denied. Status can only remove eligibility — it never grants.
  if not (v_status = any (v_active_statuses)) then
    raise exception 'SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE' using errcode = '42501';
  end if;

  v_is_admin := v_role in ('admin','super_admin');

  if not v_is_admin then
    select be.profile_id, be.assigned_advisor_id into v_entity
      from public.business_entities be
     where be.id = p_business_id;

    if v_entity.profile_id is not null and v_entity.profile_id = p_actor_profile_id then
      v_authorized := true;                                    -- verified business owner
    elsif v_advisor_authority_enabled                           -- D-4: a constant, and false
          and v_role = 'advisor'
          and v_entity.assigned_advisor_id is not null
          and v_entity.assigned_advisor_id = p_actor_profile_id then
      v_authorized := true;                                    -- would be: assigned advisor
    else
      select true into v_authorized
        from public.business_owners bo
       where bo.business_id = p_business_id
         and bo.profile_id = p_actor_profile_id
         and (bo.end_date is null or bo.end_date >= current_date)
       limit 1;
      v_authorized := coalesce(v_authorized, false);            -- explicit ownership record
    end if;
  end if;

  if not v_authorized and not v_is_admin then
    raise exception 'SNAPSHOT_FORBIDDEN' using errcode = '42501';
  end if;

  -- ── 5. CONTRACT ENFORCEMENT — the database is the authority ───────────────
  v_contract := public.s4_mapping_contract(p_mapping_version);
  if v_contract is null then
    raise exception 'SNAPSHOT_MAPPING_VERSION_UNSUPPORTED' using errcode = '22023';
  end if;

  v_type_spec := v_contract->'types'->v_doc_type;               -- type read from documents
  if v_type_spec is null then
    raise exception 'SNAPSHOT_DOCUMENT_TYPE_UNSUPPORTED' using errcode = '22023';
  end if;
  if p_basis is distinct from v_type_spec->>'basis' then
    raise exception 'SNAPSHOT_BASIS_MISMATCH' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(p_field_map)) <>
     (select count(distinct e->>'target') from jsonb_array_elements(p_field_map) e) then
    raise exception 'SNAPSHOT_DUPLICATE_TARGET' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_field_map) e
     where not exists (
       select 1 from jsonb_array_elements(v_type_spec->'targets') t
        where t->>'target' = e->>'target')
  ) then
    raise exception 'SNAPSHOT_TARGET_NOT_IN_CONTRACT' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(p_field_map) e,
                          jsonb_array_elements_text(e->'field_ids') f) <>
     (select count(distinct f) from jsonb_array_elements(p_field_map) e,
                                  jsonb_array_elements_text(e->'field_ids') f) then
    raise exception 'SNAPSHOT_DUPLICATE_FIELD' using errcode = '22023';
  end if;

  -- ── 6. VALUES — iterated in CONTRACT order, never in caller order ─────────
  for v_spec in select * from jsonb_array_elements(v_type_spec->'targets') loop
    v_target  := v_spec->>'target';
    v_meta_key := null;

    if left(v_target, 9) = 'metadata.' then
      v_meta_key := substr(v_target, 10);
      if v_meta_key = '' or position('.' in v_meta_key) > 0 then
        raise exception 'SNAPSHOT_INVALID_TARGET' using errcode = '22023';
      end if;
      if v_meta_key = any (v_reserved_meta_keys) then
        raise exception 'SNAPSHOT_RESERVED_METADATA_KEY' using errcode = '22023';
      end if;
    else
      if v_target = any (v_reserved_meta_keys) then
        raise exception 'SNAPSHOT_RESERVED_METADATA_KEY' using errcode = '22023';
      end if;
      if not (v_target = any (v_metric_columns)) then
        raise exception 'SNAPSHOT_INVALID_TARGET' using errcode = '22023';
      end if;
    end if;

    select e into v_entry from jsonb_array_elements(p_field_map) e
     where e->>'target' = v_target;
    if v_entry is null then continue; end if;                  -- optional target not supplied

    if coalesce(v_entry->>'op','') <> v_spec->>'op' then
      raise exception 'SNAPSHOT_OP_MISMATCH' using errcode = '22023';
    end if;

    select array_agg(x::uuid order by x::uuid) into v_ids
      from jsonb_array_elements_text(v_entry->'field_ids') x;
    v_requested := array_length(v_ids, 1);
    if v_requested is null then
      raise exception 'SNAPSHOT_INVALID_TARGET' using errcode = '22023';
    end if;
    if v_spec->>'cardinality' = 'one' and v_requested <> 1 then
      raise exception 'SNAPSHOT_CARDINALITY_VIOLATION' using errcode = '22023';
    end if;

    -- EVERY contributing row must be an accepted/corrected field of THIS document AND this
    -- business AND carry the contract's source field_name AND hold a non-NULL value. The
    -- field_name test is what makes substitution impossible, and the score aggregate preserves
    -- each source confidence verbatim, ordered by id so it aligns with v_ids.
    select count(*), count(f.accepted_normalized_value), sum(f.accepted_normalized_value),
           jsonb_agg(jsonb_build_object('field_id', f.id, 'score', f.confidence_score)
                     order by f.id)
      into v_found, v_nonnull, v_total, v_source_scores
      from public.extracted_fields f
     where f.id = any (v_ids)
       and f.document_id = p_source_document_id
       and f.business_id = p_business_id
       and f.review_status in ('accepted','corrected')
       and f.field_name = v_spec->>'from';

    if coalesce(v_found, 0) <> v_requested then
      raise exception 'SNAPSHOT_FIELD_NOT_CONTRACTED' using errcode = '42501';
    end if;
    -- A NULL contributor is refused outright: sum() would silently skip it and present an
    -- unknown as a complete figure.
    if v_nonnull <> v_requested then
      raise exception 'SNAPSHOT_FIELD_VALUE_MISSING' using errcode = '22023';
    end if;

    if v_spec->>'op' = 'mean' then
      v_value := round(v_total / v_requested, 6);
    else
      v_value := v_total;                                      -- direct and sum: every row non-NULL
    end if;

    if v_meta_key is not null then
      v_meta_metrics := jsonb_set(v_meta_metrics, array[v_meta_key], to_jsonb(v_value), true);
    else
      v_metrics := jsonb_set(v_metrics, array[v_target], to_jsonb(v_value), true);
    end if;

    v_provenance := jsonb_set(v_provenance, array[v_target],
      jsonb_build_object('op', v_spec->>'op', 'from', v_spec->>'from',
                         'field_ids', to_jsonb(v_ids),
                         'scores', coalesce(v_source_scores, '[]'::jsonb)), true);
    -- Both accumulators follow CONTRACT order, so a reordered delivery cannot change the hash.
    -- The per-field scores are hashed so that "identical hash ⇒ identical stored row" stays true.
    v_hash_input   := v_hash_input   || jsonb_build_array(
                          jsonb_build_object('t', v_target, 'v', v_value,
                                             's', coalesce(v_source_scores, '[]'::jsonb)));
    v_source_input := v_source_input || jsonb_build_array(
                          jsonb_build_object('t', v_target, 'ids', to_jsonb(v_ids)));
  end loop;

  -- ── 7. CONTRIBUTORS + CONFIDENCE — ALL-OR-NOTHING OVER A VALIDATED SCALE ───
  select array_agg(distinct c::uuid) into v_contributor_ids
    from jsonb_array_elements(v_source_input) e,
         jsonb_array_elements_text(e->'ids') c;

  if v_contributor_ids is null or array_length(v_contributor_ids, 1) is null then
    raise exception 'SNAPSHOT_NO_CONTRIBUTORS' using errcode = '22023';
  end if;

  with conversion as (
    select
      case
        when f.confidence_score is null
          then null
        when length(f.confidence_score) > v_conf_max_len
          then null
        when f.confidence_score !~ v_conf_pattern
          then null
        -- THE ONLY CONVERSION OF confidence_score IN THIS FUNCTION. `case` evaluates this arm
        -- solely for a row that reached it — i.e. after the length cap and the format test have
        -- both passed — so it can never raise 22P02 and can never see an unbounded-length string.
        else (f.confidence_score)::numeric
      end as score
      from public.extracted_fields f
     where f.id = any (v_contributor_ids)
  ),
  bounded as (
    -- The scale check runs on the ALREADY-CONVERTED numeric: no further conversion is involved.
    select case when c.score between 0 and 100 then c.score end as score
      from conversion c
  )
  select count(*), count(b.score), avg(b.score)
    into v_contributor_count, v_scored_count, v_confidence
    from bounded b;

  if v_contributor_count <> array_length(v_contributor_ids, 1) then
    raise exception 'SNAPSHOT_CONTRIBUTOR_DRIFT' using errcode = '42501';
  end if;

  -- ALL-OR-NOTHING. A mean over a subset would publish a partial basis as a complete figure:
  -- if ANY unique contributing field lacks a valid score, the aggregate is UNKNOWN — never 0.
  if v_scored_count = v_contributor_count then
    v_confidence_stored := round(v_confidence, 2);
  else
    v_confidence_stored := null;
  end if;

  -- ── 8. DERIVED FIELDS — resolved BEFORE hashing, because they are part of it ──
  v_snapshot_date := make_date(v_doc_year, 12, 31);            -- year required at step 3
  v_snapshot_type := coalesce(p_snapshot_type,
    case when v_doc_type = 'business_tax_return'
         then 'tax_year' else 'historical' end);

  -- ── 9. CONTENT HASH — everything stored that is content, and nothing else ──
  -- Covers financial content, source provenance (including the per-field scores), source identity,
  -- contract identity, the resolved type and date, and the STORED confidence. Deliberately
  -- EXCLUDES mutable promotion state (is_latest) and attribution (created_by,
  -- created_by_base44_user_id, the submission audit) so dedupe works across callers (D-14).
  v_content_hash := md5(jsonb_build_object(
    'business',        p_business_id,
    'document',        p_source_document_id,
    'profile',         v_doc_profile,
    'mapping_version', p_mapping_version,
    'document_type',   v_doc_type,
    'basis',           p_basis,
    'snapshot_type',   v_snapshot_type,
    'snapshot_date',   v_snapshot_date,
    'confidence',      v_confidence_stored,
    'values',          v_hash_input,
    'sources',         v_source_input
  )::text);

  -- ── 10. SERIALIZE — held only across the lookup and the writes ────────────
  perform pg_advisory_xact_lock(
    hashtextextended('s4:snapshot:' || p_business_id::text, 0));

  select id, snapshot_type, is_latest, data_confidence_score
    into v_existing, v_existing_type, v_existing_latest, v_existing_confidence
    from public.business_metric_snapshots
   where business_id = p_business_id
     and metadata->>'content_hash' = v_content_hash
   limit 1;

  if v_existing is not null then
    -- Same hash ⇒ same document, version, type and content by construction. Assert it rather
    -- than assume it: a divergence means either the hash or the stored row is wrong.
    if v_existing_type is distinct from v_snapshot_type then
      raise exception 'SNAPSHOT_DEDUPE_TYPE_MISMATCH' using errcode = '22023';
    end if;
    v_snapshot_id := v_existing;
    v_dedup := true;
    -- The dedupe path does NOT touch the snapshot row: no metadata rewrite, no attribution
    -- update. Only the audit row below is appended (D-14).
  else
    -- created_by is deliberately ABSENT (D-13): nullable, FK to profiles(id), no default, and
    -- 0 of 72 existing rows carry it — omitting it preserves the table's own convention.
    insert into public.business_metric_snapshots (
      profile_id, business_id, snapshot_type, snapshot_date,
      annual_revenue, gross_profit, net_profit, total_expenses, owner_compensation,
      payroll, total_debt, cash_on_hand, total_assets,
      metadata, data_source, source_document_id, data_confidence_score, is_latest
    )
    values (
      v_doc_profile, p_business_id, v_snapshot_type, v_snapshot_date,
      (v_metrics->>'annual_revenue')::numeric,
      (v_metrics->>'gross_profit')::numeric,
      (v_metrics->>'net_profit')::numeric,
      (v_metrics->>'total_expenses')::numeric,
      (v_metrics->>'owner_compensation')::numeric,
      (v_metrics->>'payroll')::numeric,
      (v_metrics->>'total_debt')::numeric,
      (v_metrics->>'cash_on_hand')::numeric,
      (v_metrics->>'total_assets')::numeric,
      v_meta_metrics
        || jsonb_build_object(
             'mapping_contract', jsonb_build_object('version', p_mapping_version,
                                                    'document_type', v_doc_type),
             'basis', p_basis,
             'content_hash', v_content_hash,
             'provenance', v_provenance,
             'created_by_base44_user_id', p_actor_base44_user_id
           ),
      'advisor_review',                            -- permitted by business_metric_snapshots_data_source_check
      p_source_document_id,
      v_confidence_stored,
      false                                        -- is_latest starts false; promoted below
      -- is_baseline, scenario_type, created_at, updated_at and the period columns take their
      -- column defaults. No trigger exists on this table.
    )
    returning id, created_by into v_snapshot_id, v_persisted_created_by;

    -- Runtime tripwire: the stored row must equal what the hash was computed from, and the
    -- omitted attribution column must still be NULL.
    select metadata, snapshot_date, data_confidence_score
      into v_persisted_metadata, v_persisted_date, v_persisted_confidence
      from public.business_metric_snapshots where id = v_snapshot_id;

    if v_persisted_metadata is null
       or v_persisted_created_by is not null                       -- D-13: never written
       or v_persisted_date is distinct from v_snapshot_date
       or v_persisted_confidence is distinct from v_confidence_stored
       or not (v_persisted_metadata @> v_meta_metrics)
       or (v_persisted_metadata->>'content_hash') is distinct from v_content_hash then
      raise exception 'SNAPSHOT_IDENTITY_LOST' using errcode = '22023';
    end if;
  end if;

  -- ── 11. is_latest — DEMOTE FIRST, THEN PROMOTE (the deployed partial unique index
  --        unique_latest_snapshot_per_business makes this ordering mandatory) ──
  -- NOTE: the demote below is the ONE place this migration modifies EXISTING rows. It changes
  -- promotion state only — never a financial column, never metadata. The demoted row is NOT
  -- recorded in the audit (the audit records the promoted snapshot), so restoring the previous
  -- promotion state needs the pre-run capture described in §4.
  if coalesce(p_is_latest, false) then
    -- Captured BEFORE the demotion, and independently of the dashboard: a promotion that moves
    -- the business's basis BACKWARDS is worth reporting even while nothing is projected.
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
      v_promoted_over_newer := true;              -- allowed, but never silent
    end if;
  elsif v_dedup then
    v_is_latest_now := coalesce(v_existing_latest, false);
  else
    v_is_latest_now := false;
  end if;

  -- ── 12. DASHBOARD PROJECTION — DISABLED (D-19) ────────────────────────────
  -- Snapshots and promotion are unaffected; only the projection INTO dashboard_metrics is
  -- withheld. A direct RPC call with p_update_dashboard => true is refused HERE, by this
  -- constant — not by trusting the caller to have disabled it.
  if not v_dashboard_projection_enabled then
    if coalesce(p_update_dashboard, false) then
      v_dashboard_skip := 'projection_disabled';
    end if;
  elsif coalesce(p_update_dashboard, false) then
    if not v_is_latest_now then
      v_dashboard_skip := 'not_latest';           -- an older replay: refused, and reported
    elsif (v_metrics ? 'annual_revenue' or v_metrics ? 'net_profit') then
      -- PRESERVED FOR THE FUTURE ENABLE (D-19). The conflict target carries the index predicate:
      -- ux_dashboard_metrics_business_id is a PARTIAL unique index, and a bare
      -- ON CONFLICT (business_id) is NOT inferred by PostgreSQL. Do not simplify this line.
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

  -- ── 13. SUBMISSION AUDIT — written on BOTH paths, so a duplicate never goes unrecorded ──
  insert into public.snapshot_submission_audit (
    snapshot_id, business_id, content_hash, actor_profile_id, actor_base44_user_id,
    deduplicated, dashboard_updated, is_latest_requested
  )
  values (
    v_snapshot_id, p_business_id, v_content_hash, p_actor_profile_id, p_actor_base44_user_id,
    v_dedup, v_dashboard_done, coalesce(p_is_latest, false)
  );

  return jsonb_build_object(
    'snapshot_id',               v_snapshot_id,
    'deduplicated',              v_dedup,
    'dashboard_metrics_updated', v_dashboard_done,
    'dashboard_skipped_reason',  v_dashboard_skip,
    'promoted_over_newer',       v_promoted_over_newer,
    'snapshot_type',             coalesce(v_existing_type, v_snapshot_type),
    'is_latest',                 v_is_latest_now,
    'applied',                   v_metrics || v_meta_metrics,
    'skipped',                   coalesce(p_skipped, '[]'::jsonb),
    'confidence_score',          coalesce(v_existing_confidence, v_confidence_stored)
  );
end;
$$;

-- ── ACCESS CONTROL — REVOKE FIRST, THEN GRANT (CB-001.1 precedent) ──────────
-- PostgreSQL grants EXECUTE to PUBLIC by default, and this workspace's pg_default_acl
-- additionally names anon and authenticated for new functions in public.
revoke all on function public.create_reviewed_fields_snapshot(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, boolean) from public;
revoke all on function public.create_reviewed_fields_snapshot(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, boolean) from anon, authenticated;
grant execute on function public.create_reviewed_fields_snapshot(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, boolean) to service_role;

comment on function public.create_reviewed_fields_snapshot(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, boolean) is
'Phase S4: atomic, idempotent persistence of an advisor-reviewed snapshot. service_role ONLY
(owner and superusers aside). p_actor_profile_id is a CLAIM, NOT end-user authentication: this
function validates the claimed profile, its status, and its authorized relationship to the
business. It cannot prove which end user initiated the call. Values are read here from
accepted/corrected extracted_fields of this document and business that carry the target
contract''s declared source field name; no caller-supplied value is trusted. The reporting year is
required (no CURRENT_DATE fallback). created_by is never written. Confidence is NULL unless every
contributing field carries a valid 0-100 score, and is converted only through a guarded CASE.
p_field_map and p_skipped are validated fail-closed before any financial processing (object type, allowed keys only, uuid formatting, array structure, op vocabulary); no cast is reachable from unvalidated input.
Serialized per business by a transaction-scoped advisory lock; identical content is deduplicated;
every submission, including a duplicate, is recorded in public.snapshot_submission_audit.';

-- ══════════════════════════════════════════════════════════════════════════════
-- TRANSACTION GUARD — the FINAL statement of this script.
-- Position matters and is deliberate: it runs inside the same transaction as
-- every REVOKE/GRANT above, after all of them, and before COMMIT. It creates,
-- alters and grants NOTHING — it only reads the catalog and raises — so it can
-- neither change an ACL nor mask a failure.
-- A raise aborts the transaction: an object whose ACL is wrong is never
-- committed, and there is no window in which a wrong grant exists.
-- Effective privileges are asserted: has_table_privilege and
-- has_function_privilege follow the role's memberships and PUBLIC grants, so an
-- INHERITED grant fails here too.
-- PostgreSQL 17 (this target is 17.11): MAINTAIN exists as a table privilege.
-- ══════════════════════════════════════════════════════════════════════════════
do $s4_acl_guard$
declare
  v_bad_table   text;
  v_bad_fn      text;
  v_tbl_acl     text;    -- non-NULL  ⇒ relacl was never materialised
  v_fn_acl_bad  text;    -- non-NULL  ⇒ proacl NULL, or PUBLIC still holds EXECUTE
  v_public_rows bigint;
  v_members     bigint;
begin
  -- ── (1) AUDIT TABLE — 24 effective-privilege expectations: 3 roles × 8 privilege types.
  --        anon and authenticated: nothing at all. service_role: SELECT + INSERT only.
  --        TRUNCATE is asserted explicitly because RLS does NOT govern TRUNCATE — the
  --        privilege layer is its only barrier, so it is proven, never assumed absent.
  --        `rol` rather than `role`, and ::name / ::text casts, so overload resolution
  --        lands on has_table_privilege(name, text, text) deterministically.
  select string_agg(format('%s:%s held=%s want=%s', rol, priv, held, want), '; ' order by rol, priv)
    into v_bad_table
    from (
      select c.rol, c.priv, c.want,
             has_table_privilege(c.rol::name,
                                 'public.snapshot_submission_audit'::text,
                                 c.priv::text) as held
        from (values
          ('anon','SELECT',false),            ('anon','INSERT',false),
          ('anon','UPDATE',false),            ('anon','DELETE',false),
          ('anon','TRUNCATE',false),          ('anon','REFERENCES',false),
          ('anon','TRIGGER',false),           ('anon','MAINTAIN',false),
          ('authenticated','SELECT',false),   ('authenticated','INSERT',false),
          ('authenticated','UPDATE',false),   ('authenticated','DELETE',false),
          ('authenticated','TRUNCATE',false), ('authenticated','REFERENCES',false),
          ('authenticated','TRIGGER',false),  ('authenticated','MAINTAIN',false),
          ('service_role','SELECT',true),     ('service_role','INSERT',true),
          ('service_role','UPDATE',false),    ('service_role','DELETE',false),
          ('service_role','TRUNCATE',false),  ('service_role','REFERENCES',false),
          ('service_role','TRIGGER',false),   ('service_role','MAINTAIN',false)
        ) c(rol, priv, want)
    ) chk
   where chk.held is distinct from chk.want;

  -- ── (2) The table ACL must be MATERIALISED, and PUBLIC (grantee 0) must hold nothing.
  select case when c.relacl is null
              then 'relacl IS NULL — the REVOKE did not run'
         end
    into v_tbl_acl
    from pg_class c
   where c.oid = 'public.snapshot_submission_audit'::regclass;

  select count(*)
    into v_public_rows
    from (select c.relacl from pg_class c
           where c.oid = 'public.snapshot_submission_audit'::regclass) t
   cross join lateral aclexplode(coalesce(t.relacl, '{}'::aclitem[])) a
   where a.grantee = 0;

  -- ── (3) BOTH FUNCTIONS — 6 effective-privilege expectations.
  select string_agg(format('%s as %s held=%s want=%s', fn, rol, held, want), '; ')
    into v_bad_fn
    from (
      select c.fn, c.rol, c.want,
             has_function_privilege(c.rol::name, c.fn::regprocedure, 'EXECUTE'::text) as held
        from (values
          ('public.s4_mapping_contract(text)','anon',false),
          ('public.s4_mapping_contract(text)','authenticated',false),
          ('public.s4_mapping_contract(text)','service_role',true),
          ('public.create_reviewed_fields_snapshot(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,boolean,boolean)','anon',false),
          ('public.create_reviewed_fields_snapshot(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,boolean,boolean)','authenticated',false),
          ('public.create_reviewed_fields_snapshot(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,boolean,boolean)','service_role',true)
        ) c(fn, rol, want)
    ) chk
   where chk.held is distinct from chk.want;

  -- ── (4) PUBLIC EXECUTE on either function, INCLUDING the NULL-proacl trap.
  --        PostgreSQL grants EXECUTE to PUBLIC on every new function, so proacl IS NULL
  --        MEANS PUBLIC still holds EXECUTE. A grantee-only test would silently pass that
  --        case; NULL is therefore a failure in its own right.
  --        coalesce() on the aclexplode input because SQL does not guarantee the
  --        evaluation order of OR arms — the same principle the confidence guard uses.
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                    ', ' order by p.proname)
    into v_fn_acl_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('s4_mapping_contract','create_reviewed_fields_snapshot')
     and ( p.proacl is null
           or exists (select 1 from aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
                       where a.grantee = 0) );

  -- ── (5) No sideways grant through role membership.
  select count(*)
    into v_members
    from pg_auth_members am
    join pg_roles m on m.oid = am.member
   where m.rolname in ('anon','authenticated');

  if v_bad_table is not null or v_bad_fn is not null or v_tbl_acl is not null
     or v_fn_acl_bad is not null or v_public_rows <> 0 or v_members <> 0 then
    raise exception
      'S4_ACL_GUARD_FAILED table=[%] functions=[%] table_acl=[%] function_acl=[%] public_grants=% memberships=%',
      v_bad_table, v_bad_fn, v_tbl_acl, v_fn_acl_bad, v_public_rows, v_members
      using errcode = '42501';
  end if;
end
$s4_acl_guard$;
```

---

## 3.1 The transaction guard — exact assertions

The guard is the `do $s4_acl_guard$ … $s4_acl_guard$;` block that closes §3. It is a **gate, not a report**: the operator cannot misread it, and a later `COMMIT` cannot persist a hole, because a failed assertion raises and the raise aborts the transaction.

| # | Assertion | Mechanism | Outcome on violation |
|---|---|---|---|
| **G-1** | `anon` holds **none** of SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on `snapshot_submission_audit` | `has_table_privilege` × 8 | `S4_ACL_GUARD_FAILED` |
| **G-2** | `authenticated` holds **none** of the same eight | `has_table_privilege` × 8 | same |
| **G-3** | `service_role` holds **SELECT and INSERT, and nothing else** — UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN all false | `has_table_privilege` × 8 | same |
| **G-4** | The table's `relacl` is **materialised** (proving the `REVOKE` ran) and carries **no `grantee = 0`** row | `pg_class` + `aclexplode` | same |
| **G-5** | `anon` **false**, `authenticated` **false**, `service_role` **true** on **both** functions | `has_function_privilege` × 6 | same |
| **G-6** | Neither function's `proacl` is **NULL** or **PUBLIC-granted** | `pg_proc` + `aclexplode` | same |
| **G-7** | No role membership for `anon` or `authenticated` | `pg_auth_members` | same |

**Five properties that make the block safe to trust:**

1. **It asserts *effective* privileges.** `has_table_privilege` and `has_function_privilege` resolve through role memberships **and** PUBLIC grants, so a privilege inherited sideways fails the guard even though no `GRANT … TO anon` appears anywhere in this file. G-7 then catches the membership itself.
2. **NULL `proacl` is a failure, not a pass.** PostgreSQL grants `EXECUTE` to PUBLIC on every new function, so a NULL `proacl` *means* PUBLIC still holds it. A test that only counted `grantee = 0` rows would return zero and wrongly pass; the explicit `proacl is null` arm closes that.
3. **`TRUNCATE` is asserted rather than assumed.** RLS is not consulted for `TRUNCATE`, so the privilege layer is its only barrier — and `pg_default_acl` in this environment grants `arwdDxtm` to `anon`/`authenticated` on new tables, `T` included. `service_role` receives only `SELECT, INSERT`, so it cannot truncate either.
4. **No OR-arm evaluation order is relied on.** `aclexplode` receives `coalesce(…, '{}'::aclitem[])`, so a NULL ACL can never reach it whichever arm PostgreSQL evaluates first — the same principle the confidence guard applies to its `CASE` arms.
5. **The block changes nothing.** No `CREATE`, `ALTER`, `GRANT` or `REVOKE` appears in it, so it cannot repair the state it is testing, and its own execution cannot influence the result.

**Runner rule — absolute.** Any error from this script means **`ROLLBACK`**. The migration must be applied inside one explicit `begin; … commit;`. In autocommit mode the guard would still raise but would roll back nothing, and the entire protection would be void.

**Static validation performed (PostgreSQL 17, not executed):** dollar-quote tags paired (`$s4_acl_guard$` × 2), `DECLARE … BEGIN … END` block placement, parenthesis and `VALUES` list balance, `has_table_privilege(name, text, text)` and `has_function_privilege(name, oid, text)` overload selection via the explicit `::name` / `::text` / `::regprocedure` casts, `bigint` for both `count(*)` targets, `RAISE EXCEPTION … USING errcode = '42501'` argument order, `MAINTAIN` as a PG 17 privilege keyword, and statement ordering against the last `GRANT` in the file (§3's `grant execute` on the snapshot function, which precedes this block).

---

## 3.2 `p_field_map` / `p_skipped` validation — exact rules

Step 1.1 runs before the contract lookup, before the business/document authorization reads and before any financial processing. It is **deterministic** (no branch depends on data), **fail-closed** (an unrecognised shape is refused, never coerced) and **named** (every refusal carries a message the operator can act on).

| # | Check | Rule | Error | Statement order |
|---|---|---|---|---|
| V-1 | `p_field_map` is an array and not empty | `jsonb_typeof = 'array'` and `<> '[]'` | `SNAPSHOT_INVALID_INPUT` | pre-existing, unchanged (step 1) |
| V-2 | Every entry is an **object** | `jsonb_typeof(e) = 'object'` | `SNAPSHOT_INVALID_FIELD_MAP` | 1 |
| V-3 | **Allowed keys only** | keys ⊆ `{target, op, field_ids}` | `SNAPSHOT_INVALID_FIELD_MAP` | 2 |
| V-4 | `target` is text | `jsonb_typeof(e->'target') = 'string'`, length 1–128 | `SNAPSHOT_INVALID_FIELD_MAP` | 3 |
| V-5 | `op` is in the vocabulary | `coalesce(op,'') ∈ {direct, sum, mean}` | **`SNAPSHOT_OP_MISMATCH`** | 4 |
| V-6 | `field_ids` is an **array** | `jsonb_typeof(e->'field_ids') = 'array'` | `SNAPSHOT_INVALID_FIELD_MAP` | 5 |
| V-7 | Every id is a **string** | `jsonb_typeof(f) = 'string'` | `SNAPSHOT_INVALID_FIELD_MAP` | 6 |
| V-8 | **UUID formatting** | 36 chars, `^[0-9a-fA-F]{8}-…-[0-9a-fA-F]{12}$` | `SNAPSHOT_INVALID_FIELD_MAP` | 7 |
| V-9 | `p_skipped` is null or an array | `jsonb_typeof ∈ {array}` | `SNAPSHOT_INVALID_SKIPPED` | 8 |
| V-10 | Bounded length | ≤ 1000 entries | `SNAPSHOT_INVALID_SKIPPED` | 9 |
| V-11 | Every entry an object | `jsonb_typeof(s) = 'object'` | `SNAPSHOT_INVALID_SKIPPED` | 10 |
| V-12 | Allowed keys only | keys ⊆ `{field, reason}` | `SNAPSHOT_INVALID_SKIPPED` | 11 |
| V-13 | `field` required, text | string, length 1–128 | `SNAPSHOT_INVALID_SKIPPED` | 12 |
| V-14 | `reason` optional, text | absent, or string | `SNAPSHOT_INVALID_SKIPPED` | 13 |
| V-15 | No duplicate `field` | `count(*) = count(distinct field)` | `SNAPSHOT_INVALID_SKIPPED` | 14 |

**Three properties worth naming:**

1. **No cast is reachable from unvalidated input.** Before this block, a `field_ids` value such as `"not-a-uuid"` reached `x::uuid` at step 6 and raised PostgreSQL's own `22P02`; a `field_ids` scalar reached `jsonb_array_elements_text` and raised its own error. Both are now refused by name at the boundary. The step-6 cast survives only as a **guarded** cast over ids V-8 already proved canonical.
2. **The order is guaranteed, and it is statement order.** These are fourteen separate statements, not OR-joined predicates inside one, so PostgreSQL's freedom over `AND`/`OR` evaluation order never enters the picture — the same reasoning the confidence guard uses. Each statement therefore sees only input its predecessors proved well-typed, which is why V-8 can read `f #>> '{}'` without a type branch beside it.
3. **A caller cannot smuggle a value.** V-3 refuses an entry carrying `value` / `accepted_normalized_value` / anything else. Values were already read from `extracted_fields` and never from the payload; the difference is that the payload now **says so out loud** instead of being quietly ignored.

### Contract and cardinality behaviour is unchanged

Every expectation in the test plan is decided by the step it was always decided by. The validation block only rejects shapes that previously produced either a *different* named error or a *raw PostgreSQL* error.

| Test | Input | Verdict before | Verdict now |
|---|---|---|---|
| **T-304** | reserved/unknown **target** (`metadata.provenance`, `content_hash`, …) | `SNAPSHOT_TARGET_NOT_IN_CONTRACT` (step 5) | **Unchanged** — the entry is structurally valid, so it reaches step 5 |
| **T-305** | duplicate **target** · same field id on two targets | `SNAPSHOT_DUPLICATE_TARGET` · `SNAPSHOT_DUPLICATE_FIELD` (step 5) | **Unchanged.** Duplicate ids are still adjudicated at step 5, for both the within-entry and the cross-entry case — the count-vs-distinct test spans every `(entry, id)` pair, so neither case moved |
| **T-306** | wrong `op` for a declared target · `direct` with 2 ids · `direct` with `[]` | `SNAPSHOT_OP_MISMATCH` · `SNAPSHOT_CARDINALITY_VIOLATION` · `SNAPSHOT_INVALID_TARGET` (step 6) | **Unchanged.** V-5 checks only vocabulary membership — `'sum'` on a `direct` target still passes it and is still refused by the contract comparison. V-6 accepts an **empty** array, so the empty-`field_ids` verdict stays at step 6 |
| **T-306b** | `sum`/`mean` with 1 or 3 ids | ALLOWED | **Unchanged** — `many` carries no count constraint anywhere |
| **T-307 / T-311 / T-312** | version · year · `snapshot_type` | as documented | **Unchanged** — none is payload shape |
| **T-310** | manipulated financial value in the payload | No effect (values not read from the caller) | **Stronger**: an embedded `value` key is now refused outright (V-3) |

One precedence shift, stated rather than hidden: an entry that is *both* structurally malformed and names an uncontracted target now fails at V-2…V-8 instead of at step 5. Both paths raise `22023`, no documented case pairs the two, and failing on the malformed shape first is the deterministic choice.

---

## 3.3 The actor boundary — what this function can and cannot establish

**`service_role` is database capability, not identity.** The function is executed by a caller holding the service-role key; it receives no end-user token and no session. PostgREST has already substituted `service_role` for whatever role might otherwise apply, and RLS is bypassed entirely. There is **no mechanism inside this function — or inside PostgreSQL — that can attribute the call to an end user.** That is not a gap in the implementation; it is what a service-role connection is.

Consequently:

| Fact | Status |
|---|---|
| `p_actor_profile_id` is a **claim** supplied by the caller | **By construction.** Validated as a *relationship* — the profile exists, its status is `active`/`incomplete`, and it is the business's owner, an explicit `business_owners` holder, an assigned advisor (disabled, D-4) or an admin |
| `p_actor_base44_user_id` is a claimed **binding**, stored but never verified | **By construction.** Nothing in the database can verify it against a session that the database never saw |
| The audit row proves *who was claimed*, never *who acted* | **By construction** — the table and function comments say exactly this |
| End-user identity (`base44.auth.me()` → `profiles.base44_user_id` equality → refusal when absent) is established **in the Base44 layer, before this RPC is reached** | **The caller's obligation, and the only place it can be met** |
| A direct-RPC test can prove authorization *of a claim* and *zero writes on refusal* | **True** (T-901/T-902) |
| A direct-RPC test can prove that the **endpoint** refuses a forged administrator identity | **False — impossible.** That is an endpoint property; it needs a live session and is deferred (§5 of the plan) |

**Verified finding — the deployed caller does not yet meet that obligation.** Source inspection of `base44/functions/createSnapshotFromReviewedFields/entry.ts` (read-only; not modified by this package) shows it does **not** use the platform's `base44/shared/authz/actor.ts` boundary at all, and that it (a) swallows a failed `auth.me()` into `user = null`, (b) then skips its own role check entirely when `user` is null, (c) checks the **document owner's** `profiles.app_role` rather than the caller's, and (d) writes `created_by: user?.id || profile.id` — falling back to a non-session identity. It also bypasses this RPC and writes the snapshot directly, demoting `is_latest` in a **separate** statement.

Therefore: **this migration is correct and safe as specified, and it does not make the current endpoint safe.** Applying D2 changes none of those four behaviours, because they all live above it. Full evidence, line references and the required remediation are in `VISION_S4_GATE_B_EXECUTION_SAFETY_PLAN.md` §5.5, with the blocker recorded as **B9**.

---

## 4. Rollback (exact)

| Order | Layer | Action |
|---|---|---|
| **1** | Base44 | Revert `base44/functions/createSnapshotFromReviewedFields/entry.ts` via deploy history, **and** revert the one-line selector at `src/components/admin/ExtractedFieldsReviewQueue.jsx:424` |
| **2** | Supabase | The SQL below |

```sql
-- Order matters: the snapshot function writes the audit table, so the function goes first.
drop function if exists public.create_reviewed_fields_snapshot(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, boolean);
drop function if exists public.s4_mapping_contract(text);
drop table     if exists public.snapshot_submission_audit;
```

**Deploy order:** migration first (additive; nothing calls it until the caller ships), then the Base44 function and the UI line together. Rollback is the reverse — dropping the function while the new caller is live would break snapshot creation.

**If the guard raises, none of the above applies.** A guard failure aborts the transaction before `COMMIT`, so no object was created and there is nothing to roll back — the correct response is to let the transaction abort and investigate the reported expectation, never to drop, revoke or "fix forward" in the same window. The §4 SQL below is the object rollback **after a successful commit**, and it is not the remedy for a guard failure.

**No content rollback — and one deliberate exception, stated plainly.** No existing row's **financial content** is written: columns, `metadata` and `data_confidence_score` on the 72 existing snapshots are untouched, and nothing is backfilled. **Promotion is the exception.** When a snapshot is promoted, the demote step sets `is_latest = false` on the business's previous `is_latest` row — a promotion-state change on an existing row, not a financial one, and it is **not** reverted by this rollback. The deployed partial unique index still guarantees exactly one `is_latest` row per business throughout.

**Consequence for rollback:** the audit records the *promoted* snapshot, never the row that was demoted, so a rollback cannot reconstruct which row previously held `is_latest`. Keep promotion state reversible by capturing the pre-run `is_latest` set by business (deliverable 4 §3 probe 2) and restoring it manually if required. That is a documented limit of the audit's scope, not a defect in it.

Snapshots written through this function otherwise use the same table and columns as any other snapshot. Dropping `snapshot_submission_audit` discards submission history only — its references are `RESTRICT` *to* other tables, so dropping it cannot cascade anywhere. Stated plainly: the pre-patch revision is itself non-functional, so a rollback restores a broken state rather than a working one.

**Audit retention on rollback:** `drop table public.snapshot_submission_audit` destroys the record of who submitted what. If retention matters at that moment, **revert the caller first** and keep the table until its rows have been exported. The table is inert without the function.

---

## 4.1 Pre-test baseline (read-only) and restoration of **synthetic** rows only

The migration itself is additive and reversible by `DROP`. The one thing it can change on an existing row is **promotion state** (`is_latest`), and the audit records the *promoted* snapshot, never the row that was demoted — so the demoted row's prior state survives **only** if it was captured first. That capture is a precondition, not a diagnostic.

### 4.1.1 The baseline — read-only, taken before the migration

```sql
-- READ-ONLY. Taken in its own session, before P3, and archived outside the database.
set local timezone = 'UTC';               -- determinism: timestamptz renders per session

-- (1) every existing snapshot id — the reference set
select id, business_id, snapshot_type, snapshot_date, is_latest
  from public.business_metric_snapshots
 order by business_id, snapshot_date, id;

-- (2) the promotion state, per business — the ONLY thing restoration can need
select business_id, id as latest_snapshot_id, snapshot_date
  from public.business_metric_snapshots
 where is_latest
 order by business_id;

-- (3) the audit surface, which must not exist yet
select to_regclass('public.snapshot_submission_audit') as audit_table,   -- expect NULL
       to_regclass('public.create_reviewed_fields_snapshot') as rpc,     -- expect NULL
       to_regclass('public.s4_mapping_contract') as contract;            -- expect NULL
```

(3) returning three NULLs is the **absence** proof: there are no audit records to baseline, because no audit table exists. If any is non-NULL, the run stops — an S4 object already exists.

For (1) and (2), the **full-row digest** of the same set is captured alongside them (the method is in the execution safety plan §7.1), so "nothing changed" is provable per row rather than by count.

### 4.1.2 Restoration — separately authorized, synthetic rows only

| # | Rule |
|---|---|
| **R-1** | Restoration is **never** part of the migration window. It is a separate act, separately authorized, in its own window. |
| **R-2** | Restoration may touch **only** rows whose `business_id` is in the synthetic registry — the businesses this plan created. Restoration **cannot reach** a pre-existing snapshot, because no pre-existing `business_id` appears in the registry. |
| **R-3** | Restoration restores **`is_latest` only**, to the values captured in §4.1.1(2). It never restores, rewrites, recomputes or resets a **financial** column, `metadata`, `data_confidence_score` or `created_by` — on any row, synthetic or not. |
| **R-4** | Restoration is **one transaction**, preceded by a fresh capture proving the current state, and followed by a re-read proving the target state. |
| **R-5** | **No CB-005B record of any kind is read for modification, updated, deleted, truncated, reset or re-keyed** by this migration, by its rollback, or by any restoration under this section. `provider_sync_jobs`, `provider_observations`, `provider_sync_checkpoints`, `provider_operation_audit`, `provider_credentials`, `provider_authorization_attempts` and `business_connections` are outside this package's write surface entirely. |
| **R-6** | If a synthetic id cannot be restored because an audit row references it, **that is the final state**. `ON DELETE RESTRICT` is doing its job; the reference is evidence, not an obstacle to clear. |
| **R-7** | Deleting synthetic rows at all is a **separate authorization** (the ordered teardown in the plan §10.2), never a restoration step, and never in the migration window. |

Stated as the single sentence a reviewer needs: **the migration writes no financial record, the baseline proves it, and restoration is confined to `is_latest` on businesses that did not exist before the run.**

---

## 5. Monitoring query — same guard, applied

```sql
-- Read-only, informational. Uses the SAME guarded conversion as the function: length cap first,
-- then format, and one conversion reachable only after both. Never casts an unvalidated string.
-- Expected on the current data (248 rows): valid = 80, no_score = 168, unusable = 0.
with converted as (
  select f.confidence_score as raw,
         case
           when f.confidence_score is null
             then null
           when length(f.confidence_score) > 16
             then null
           when f.confidence_score !~ '^[[:space:]]*[0-9]{1,3}(\.[0-9]{1,4})?[[:space:]]*$'
             then null
           else (f.confidence_score)::numeric
         end as score
    from public.extracted_fields f
),
bounded as (
  select c.raw,
         case when c.score between 0 and 100 then c.score end as score
    from converted c
)
select count(*) filter (where b.score is not null)                    as valid,
       count(*) filter (where b.raw is null)                          as no_score,
       count(*) filter (where b.raw is not null and b.score is null)   as unusable
  from bounded b;

-- Which documents carry an unusable score, so it can be corrected at review time. The SAME guard:
-- the conversion happens once, after the length cap and the format test, so no unvalidated string
-- is ever cast and no predicate evaluation order is relied upon.
select u.document_id, count(*) as unusable_rows
  from (
    select f.document_id,
           f.confidence_score as raw,
           case
             when f.confidence_score is null then null
             when length(f.confidence_score) > 16 then null
             when f.confidence_score !~ '^[[:space:]]*[0-9]{1,3}(\.[0-9]{1,4})?[[:space:]]*$' then null
             else (f.confidence_score)::numeric
           end as score
      from public.extracted_fields f
  ) u
 where u.raw is not null
   and (u.score is null or u.score not between 0 and 100)
 group by u.document_id;
```

---

## 6. What this migration does NOT do

- No `CREATE TABLE` / `ALTER TABLE` / `CREATE POLICY` other than the one audit table; no **schema or policy** change to `business_metric_snapshots`, `dashboard_metrics`, `extracted_fields`, `documents`, `profiles`, `business_entities`, `business_owners` or any existing index.
- No change to any existing RLS policy or privilege.
- No data migration or backfill. No existing row's **financial content** is rewritten. The single write to an existing row is the promotion demote of `is_latest` (§3 step 11, §4).
- No CB-005A, CB-005B, provider-sync, Galileo or Digital Twin object.
- No optional hardening index (D-12 deferred): the dedupe lookup is a per-business scan, which is immaterial at the current row count.
- **The transaction guard creates, alters and grants nothing** (§3.1). It reads the catalog, raises on any mismatch, and — because it runs before `COMMIT` — can only ever prevent a commit. It changes no privilege; it proves the privileges above are the ones that were intended.
- **No test, fixture, harness or rollback is executed by this file.** Applying it proves the objects and their ACLs; it proves no call path. Every behavioural assertion belongs to D3.