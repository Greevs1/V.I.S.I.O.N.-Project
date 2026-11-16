# Phase S4 — Gate A Revision 5 · **Proposed SQL migration and rollback**
## Companion to `VISION_SECURITY_S4_GATE_A_REVISION_5.md` · PROPOSAL ONLY

**Nothing here has been executed. No migration file has been created. Production is untouched.**

**Deliverable at Gate B:** `src/supabase/migrations/phase_s4_reviewed_fields_snapshot_atomic.sql` — **one** contract function, **one** snapshot function, **one** append-only table. **No** `ALTER` of any existing object, **no** policy change, **no** data change, **no** CB-005A/CB-005B object, **no** index on an existing table.

**Preflight (all closed, read-only):**

| Probe | Result |
|---|---|
| `pg_proc` for `create_reviewed_fields_snapshot` / `s4_mapping_contract` | **absent** — names free |
| `to_regclass('public.snapshot_submission_audit')` | **null** — name free |
| Deployed index `unique_latest_snapshot_per_business` | **present** (partial, `is_latest = true`) |
| Deployed index `ux_dashboard_metrics_business_id` | **present** (partial, `business_id IS NOT NULL`) |
| `service_role` privileges on the target tables | SELECT/INSERT/UPDATE **present** |

**Single-use posture:** `create table` is deliberately **not** `if not exists`, so a drifted schema fails loudly rather than silently skipping.

---

```sql
-- ============================================================================
-- Phase S4 — Gate A Revision 5
-- Atomic, idempotent, serialized persistence of an advisor-reviewed snapshot.
--
-- ADDITIVE. Creates: 1 contract function, 1 snapshot function, 1 audit table.
-- Creates NO index on an existing table. Alters NOTHING that already exists.
--
-- TRUST BOUNDARY: p_actor_profile_id is a CLAIM by the service-role caller. It does not
-- prove end-user identity. This function validates the actor's PROFILE and STATUS and its
-- authorized RELATIONSHIP to the business, and pins the tenant to the document. End-user
-- authentication happens in the Base44 function that calls this one.
--
-- SOURCE INTEGRITY: no financial VALUE is accepted. Values are read here, inside the
-- transaction, from extracted_fields rows that are accepted/corrected AND belong to this
-- document AND this business AND carry the target's declared source field name.
-- ============================================================================

-- ── 1. THE AUTHORITATIVE MAPPING CONTRACT ───────────────────────────────────
-- IMMUTABLE, read-only, no writes. The SINGLE SOURCE OF TRUTH for which accepted field may
-- feed which target. The Base44 layer keeps a mirror for building its selection; the snapshot
-- function validates every entry against THIS declaration, so a drift fails closed.
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

-- ── 2. APPEND-ONLY SUBMISSION AUDIT ────────────────────────────────────────
-- Records EVERY accepted submission, including a deduplicated one, so attribution survives a
-- content-hash dedupe without mutating the snapshot row and WITHOUT entering the content hash.
-- Append-only in practice: RESTRICT on every reference, and business_metric_snapshots carries no
-- DELETE policy. Naming follows the deployed precedent public.provider_operation_audit.
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

-- A NEW table in public inherits arwdDxtm for anon/authenticated from pg_default_acl, so both
-- the deny-all policy posture AND the explicit revoke are required.
alter table public.snapshot_submission_audit enable row level security;   -- zero policies: deny-all
revoke all on table public.snapshot_submission_audit from public;
revoke all on table public.snapshot_submission_audit from anon, authenticated;
grant select, insert on table public.snapshot_submission_audit to service_role;

comment on table public.snapshot_submission_audit is
'Phase S4: append-only record of every accepted snapshot submission (including deduplicated ones). service_role only. Never part of the snapshot content hash.';

-- ── 3. THE SNAPSHOT FUNCTION ───────────────────────────────────────────────
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
  v_advisor_authority_enabled constant boolean := false;      -- D-4: disabled in BOTH layers
  v_min_year constant integer := 1900;
  v_max_year constant integer := 2100;
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
  v_hash_input     jsonb := '[]'::jsonb;
  v_source_input   jsonb := '[]'::jsonb;
  v_content_hash   text;
  v_existing       uuid;
  v_existing_type  text;
  v_existing_latest boolean;
  v_existing_confidence numeric;
  v_snapshot_date  date;
  v_snapshot_type  text;
  v_confidence     numeric;
  v_confidence_stored numeric;
  v_snapshot_id    uuid;
  v_persisted_metadata jsonb;
  v_persisted_date date;
  v_persisted_confidence numeric;
  v_dedup          boolean := false;
  v_is_latest_now  boolean := false;
  v_dashboard_done boolean := false;
  v_dashboard_skip text;
  v_previous_latest_date date;
  v_promoted_over_newer boolean := false;
begin
  -- ── 1. INPUT SHAPE ────────────────────────────────────────────────────────
  if p_business_id is null or p_source_document_id is null
     or p_actor_profile_id is null or p_mapping_version is null then
    raise exception 'SNAPSHOT_INVALID_INPUT' using errcode = '22023';
  end if;
  if jsonb_typeof(p_field_map) <> 'array' or p_field_map = '[]'::jsonb then
    raise exception 'SNAPSHOT_INVALID_INPUT' using errcode = '22023';
  end if;
  -- 'projection' — the DEPLOYED value. 'projected' is not permitted by
  -- business_metric_snapshots_snapshot_type_check.
  if p_snapshot_type is not null
     and p_snapshot_type not in ('historical','tax_year','projection') then
    raise exception 'SNAPSHOT_INVALID_TYPE' using errcode = '22023';
  end if;

  -- ── 2. TENANT RE-DERIVED FROM PERSISTED ROWS ──────────────────────────────
  select d.business_id, d.profile_id, d.document_type, d.year
    into v_doc_business, v_doc_profile, v_doc_type, v_doc_year
    from public.documents d
   where d.id = p_source_document_id;

  if v_doc_business is null or v_doc_business <> p_business_id then
    raise exception 'SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH' using errcode = '42501';
  end if;

  -- ── 3. REPORTING YEAR — REQUIRED. No CURRENT_DATE fallback. ───────────────
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

    -- Reserved keys are compared as the EXTRACTED KEY, not as the full target: the list holds
    -- 'provenance', the target is 'metadata.provenance'.
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
    -- field_name test is what makes substitution impossible.
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
                         'field_ids', to_jsonb(v_ids)), true);
    -- Both accumulators follow CONTRACT order, so a reordered delivery cannot change the hash.
    v_hash_input   := v_hash_input   || jsonb_build_array(
                          jsonb_build_object('t', v_target, 'v', v_value));
    v_source_input := v_source_input || jsonb_build_array(
                          jsonb_build_object('t', v_target, 'ids', to_jsonb(v_ids)));
  end loop;

  -- ── 7. DERIVED FIELDS — resolved BEFORE hashing, because they are part of it ──
  v_snapshot_date := make_date(v_doc_year, 12, 31);            -- year required above
  v_snapshot_type := coalesce(p_snapshot_type,
    case when v_doc_type = 'business_tax_return'
         then 'tax_year' else 'historical' end);

  select avg(f.confidence_score::numeric) into v_confidence
    from public.extracted_fields f
   where f.document_id = p_source_document_id
     and f.business_id = p_business_id
     and f.review_status in ('accepted','corrected');

  -- At least one accepted field was required above, so this is a broken invariant, not a case.
  if v_confidence is null then
    raise exception 'SNAPSHOT_CONFIDENCE_UNAVAILABLE' using errcode = '22023';
  end if;
  v_confidence_stored := round(v_confidence, 2);

  -- ── 8. CONTENT HASH — everything stored that is content, and nothing else ──
  -- Covers financial content (columns and metadata), source provenance, source identity
  -- (document, business, owner profile), contract identity, the resolved snapshot type and
  -- date, and the STORED confidence. Deliberately EXCLUDES mutable promotion state
  -- (is_latest) and attribution (created_by, created_by_base44_user_id, the submission audit).
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

  -- ── 9. SERIALIZE — held only across the lookup and the writes ─────────────
  perform pg_advisory_xact_lock(
    hashtextextended('s4:snapshot:' || p_business_id::text, 0));

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
    returning id into v_snapshot_id;

    -- Runtime tripwire: the stored row must equal what the hash was computed from.
    select metadata, snapshot_date, data_confidence_score
      into v_persisted_metadata, v_persisted_date, v_persisted_confidence
      from public.business_metric_snapshots where id = v_snapshot_id;

    if v_persisted_metadata is null
       or v_persisted_date is distinct from v_snapshot_date
       or v_persisted_confidence is distinct from v_confidence_stored
       or not (v_persisted_metadata @> v_meta_metrics)
       or (v_persisted_metadata->>'content_hash') is distinct from v_content_hash then
      raise exception 'SNAPSHOT_IDENTITY_LOST' using errcode = '22023';
    end if;
  end if;

  -- ── 10. is_latest — DEMOTE FIRST, THEN PROMOTE (the deployed partial unique index
  --        unique_latest_snapshot_per_business makes this ordering mandatory) ──
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

  -- ── 11. DASHBOARD — ONLY THE PROMOTED SNAPSHOT MAY PROJECT ────────────────
  if coalesce(p_update_dashboard, false) then
    if not v_is_latest_now then
      v_dashboard_skip := 'not_latest';           -- an older replay: refused, and reported
    elsif (v_metrics ? 'annual_revenue' or v_metrics ? 'net_profit') then
      select sm.snapshot_date into v_previous_latest_date
        from public.business_metric_snapshots sm
       where sm.business_id = p_business_id and sm.is_latest and sm.id <> v_snapshot_id
       order by sm.snapshot_date desc limit 1;

      -- The conflict target carries the index predicate: ux_dashboard_metrics_business_id is a
      -- PARTIAL unique index, and a bare ON CONFLICT (business_id) is NOT inferred.
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

      if v_previous_latest_date is not null and v_snapshot_date < v_previous_latest_date then
        v_promoted_over_newer := true;            -- allowed, but never silent
      end if;
    else
      v_dashboard_skip := 'no_dashboard_metrics';
    end if;
  end if;

  -- ── 12. SUBMISSION AUDIT — written on BOTH paths, so a duplicate never goes unrecorded ──
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

-- ── 13. ACCESS CONTROL — REVOKE FIRST, THEN GRANT (CB-001.1 precedent) ─────
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
(owner and superusers aside). p_actor_profile_id is a claim, NOT end-user authentication: this
function validates the actor profile, its status, and its authorized relationship to the business.
Values are read here from accepted/corrected extracted_fields of this document and business that
carry the target contract''s declared source field name; no caller-supplied value is trusted. The
reporting year is required (no CURRENT_DATE fallback). Serialized per business by a
transaction-scoped advisory lock; identical content is deduplicated; every submission, including a
duplicate, is recorded in public.snapshot_submission_audit.';
```

---

## Rollback (exact)

| Order | Layer | Action |
|---|---|---|
| **1** | Base44 | Revert `createSnapshotFromReviewedFields/entry.ts` via deploy history, and revert the one-line selector at `src/components/admin/ExtractedFieldsReviewQueue.jsx:424` |
| **2** | Supabase | The SQL below |

```sql
-- Order matters: the function writes the audit table, so it goes first.
drop function if exists public.create_reviewed_fields_snapshot(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, boolean);
drop function if exists public.s4_mapping_contract(text);
drop table  if exists public.snapshot_submission_audit;
```

**Deploy order:** migration first (additive; nothing calls it until the caller ships), then the Base44 function and the UI line together. Rollback is the reverse — dropping the function while the new caller is live would break snapshot creation.

**No data rollback.** Snapshots written through the RPC use the same table and columns as any other snapshot. Existing snapshot rows are **never** rewritten. Dropping `snapshot_submission_audit` discards submission history only — its references are `RESTRICT` *to* other tables, so dropping it cannot cascade anywhere. Stated plainly: the pre-patch revision is itself non-functional, so a rollback restores a broken state rather than a working one.

---

## Residual-risk note on the rollback

`drop table public.snapshot_submission_audit` destroys the record of who submitted what. If audit retention matters at the moment of a rollback, **disable the caller first** (revert step 1) and keep the table in place until the audit rows have been exported. The table itself is inert without the function, so leaving it behind carries no runtime risk.