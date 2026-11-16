-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-002.1 ADVERSARIAL TEST — CREDENTIAL ROTATION LIFECYCLE HARDENING
-- ============================================================================
-- Proves the DATABASE enforces the ACTIVE-ONLY predecessor rule, that every
-- other state is refused, and that the rotation-unit integrity certified by
-- CB-001.2 survives the function replacement.
--
-- SYNTHETIC ONLY. No provider is contacted; no OAuth flow runs; no real
-- credential of any kind is created, requested or stored. Every credential
-- payload here is a literal marker:
--     vision_test_secret_cb0021_<tag>
-- and every synthetic connection lives in the reserved namespace:
--     00000000-0000-0000-0000-0000000c21xx
--
-- ── WHY THE POSITIVE CONTROL HAS ITS OWN IDENTITIES (CORRECTION) ────────────
--   The first version of this suite held the positive control in the same
--   generic scratch variables every later section reused, because each of the
--   negative lifecycle loop, R6, S1/S2/S3 and A4 wrote its own scratch row into
--   that shared predecessor variable.
--
--   By the time R8 and B1/B2/B3 ran, the variable no longer held the
--   positive-control predecessor: it held an R6 synthetic superseded payroll
--   credential with NO Vault material. The assertions still READ it as though it
--   were the positive pair. That is test-state contamination, and it failed in
--   the worst possible direction:
--     · R8 could only ever report FAIL against a CORRECT deployment — it counted
--       one live secret where the pair has two, and read a NULL Vault reference
--       from a row that was never rotated;
--     · B3 compared the successor against a credential of a different type and
--       reported FAIL for the same reason;
--     · B1 and B2 PASSED for the wrong reason — they compared the successor to an
--       unrelated row, so they proved nothing at all about the rotation.
--
--   The positive identities are therefore DEDICATED and IMMUTABLE:
--     v_positive_pred / v_positive_succ   assigned ONCE, in the positive control,
--                                         and never written again by anything.
--   Every other section owns its own variables — v_negative_* for the negative
--   lifecycle cases, v_struct_* for the supersession-FK cases, v_auth_* for the
--   authorization case — and CB21-R10 re-reads the positive pair AFTER all of
--   them to prove it survived unchanged.
--
--   No assertion was weakened to accommodate this: R8, B1, B2 and B3 now read the
--   pair they always claimed to be reading. The static harness asserts the
--   isolation itself (CB-87), and mutations MU21-22 … MU21-26 prove CB-87 fails
--   when the isolation is undone in any of the five ways it can be.
--
-- ── WHY NEGATIVE CASES DO NOT TOUCH VAULT ───────────────────────────────────
--   A refused rotation must create ZERO Vault material. That is provable two
--   ways, and this suite takes the stronger one: the refused cases build their
--   predecessor by DIRECT INSERT with vault_secret_id = NULL, so a correct
--   implementation performs no Vault write at all for them — and the suite still
--   MEASURES the secret count before and after to prove it (CB21-N2). The
--   ordering invariant (gate before vault.create_secret) is therefore tested by
--   the same rows that test the status rule.
--
--   The measured window opens immediately after the positive control and closes
--   after the LAST refused rotate call (R9), so it spans every refusal: the
--   R1–R5 lifecycle loop, R6, and the unresolvable identifier in R9.
--
--   Exactly ONE path exercises Vault: the positive control, which puts a
--   synthetic credential and rotates it. A synthetic secret is created inside
--   this uncommitted transaction and is discarded by the rollback; the read-only
--   residue companion measures that independently.
--
-- SAFETY DESIGN
--   • ONE begin, NO COMMIT anywhere, ONE unconditional final rollback. Every row
--     this file writes lives inside that transaction.
--   • It creates its own synthetic connections and never touches a real one.
--   • It uses ONE existing business for the primary cases and a SECOND only for
--     the cross-business case; if no second business exists that one row reports
--     SKIPPED rather than fabricating a business whose required columns this
--     artifact cannot know.
--   • Role tests switch role with SET LOCAL ROLE and report SKIPPED — never PASS
--     — when a role cannot be assumed.
--   • Every test id is emitted on BOTH paths. A section that fails unexpectedly
--     emits its own FAIL row for EACH id it owns, so a failure can never silently
--     shrink the verdict grid and be mistaken for a shorter suite.
--
-- HOW TO READ THIS — TWO EXECUTIONS, AND THE ROLLBACK IS NEVER TOUCHED
--     STEP 1  this file                                  → the CB21-* verdict grid
--     STEP 2  …_adversarial_residue.sql                  → 0 / 0 / 0 / 0 / PASS
--   The verdict grid is the last row-returning statement, BEFORE the rollback, so
--   the single grid the editor surfaces IS the verdict. NEVER comment out, move,
--   or bypass the `rollback;`.
--
-- WHAT THE NEGATIVE CASES CANNOT EXPRESS
--   provider_credential_rotate accepts NO business, NO connection and NO
--   credential_type argument — by design, so a cross-unit successor is
--   unrepresentable (certified as CB-37a). "Wrong business/connection/type" is
--   therefore not an argument-level rejection to test; it is proved as
--   INHERITANCE (CB21-B1/B2/B3: the successor can never leave the predecessor's
--   unit) and as a DATABASE refusal at the table level (CB21-S1/S2/S3).
--   CB21-R9 proves the remaining identifier case: a predecessor id that does not
--   resolve is refused.
-- ============================================================================

begin;

create temp table cb0021_adversarial_results (
  test_id     text,
  requirement text,
  expected    text,
  observed    text,
  verdict     text
) on commit drop;

do $$
declare
  biz_a uuid;
  biz_b uuid;

  -- Reserved synthetic namespace: 0c21xx. CB-001 used 0c00xx, CB-002 0c02xx,
  -- CB-003 0c03xx; none of them is reused here.
  conn_a uuid := '00000000-0000-0000-0000-0000000c2101';
  conn_b uuid := '00000000-0000-0000-0000-0000000c2102';
  conn_c uuid := '00000000-0000-0000-0000-0000000c2103';

  -- ── the positive control's identities: assigned ONCE, never written again ──
  v_positive_pred   uuid;
  v_positive_succ   uuid;
  v_positive_status text;
  v_positive_ok     boolean;

  -- ── negative-lifecycle scratch (R1–R6): never a positive identity ──────────
  v_negative_pred   uuid;
  v_negative_target uuid;

  -- ── structural scratch (S1–S3): never a positive identity ──────────────────
  v_struct_pred     uuid;
  v_struct_target   uuid;

  -- ── authorization scratch (A4): never a positive identity ──────────────────
  v_auth_pred       uuid;
  v_auth_succ       uuid;

  -- ── inheritance results (B1–B3), read from the POSITIVE pair ───────────────
  v_inherit_business   boolean;
  v_inherit_connection boolean;
  v_inherit_type       boolean;

  -- ── the positive pair re-read AFTER every scratch section (R10) ────────────
  v_pos_pred_status     text;
  v_pos_pred_material   boolean;
  v_pos_pred_business   uuid;
  v_pos_pred_connection uuid;
  v_pos_pred_type       text;
  v_pos_succ_status     text;
  v_pos_succ_business   uuid;
  v_pos_succ_connection uuid;
  v_pos_succ_type       text;

  -- ── test-local scratch ─────────────────────────────────────────────────────
  v_resolve    text;
  v_n          integer;
  v_ok         boolean;
  v_constraint text;
  v_msg        text := '';
  v_sb         integer;
  v_sa         integer;
  v_reachable  integer;

  v_pred_secret text := 'vision_test_secret_cb0021_predecessor';
  v_succ_secret text := 'vision_test_secret_cb0021_successor';
  v_life_secret text := 'vision_test_secret_cb0021_lifecycle';
  v_sr_secret   text := 'vision_test_secret_cb0021_service_role';

  unit_type text := 'quickbooks_refresh';

  v_statuses text[] := array['pending','error','expired','rotating','revoked'];
  v_tags     text[] := array['CB21-R1','CB21-R2','CB21-R3','CB21-R4','CB21-R5'];
  v_types    text[] := array['quickbooks_access','xero_refresh','xero_access','wave_access','wave_refresh'];
  i          integer;
begin
  -- ── preconditions ─────────────────────────────────────────────────────────
  select id into biz_a from public.business_entities order by id limit 1;
  select id into biz_b from public.business_entities where id is distinct from biz_a order by id limit 1;

  if biz_a is null then
    insert into cb0021_adversarial_results values
      ('CB21-U0', 'preconditions (one existing business id; a second for the cross-business case)',
       'at least one business present',
       'no business exists', 'SKIPPED');
    return;
  end if;

  insert into public.business_connections
    (id, business_id, provider, connection_category, provider_organization_id, status)
  values
    (conn_a, biz_a, 'quickbooks', 'accounting', 'item_cb0021_a', 'active'),
    (conn_b, biz_a, 'quickbooks', 'accounting', 'item_cb0021_b', 'active');

  if biz_b is not null then
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
    values
      (conn_c, biz_b, 'plaid', 'banking', 'item_cb0021_c', 'active');
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE POSITIVE CONTROL — an ACTIVE predecessor rotates, and only an active one
  --
  -- These two identities are the ONLY state the assertions below reason about,
  -- and they are never written again after this block. Every later section uses
  -- its own variables, so no scratch row can displace the pair R8, B1/B2/B3 and
  -- R10 read.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    v_positive_pred := public.provider_credential_put(biz_a, conn_a, unit_type, v_pred_secret);
    v_positive_succ := public.provider_credential_rotate(v_positive_pred, v_succ_secret);

    select count(*) = 1
           and bool_and(status = 'active')
           and bool_and(business_id = biz_a)
           and bool_and(business_connection_id = conn_a)
           and bool_and(credential_type = unit_type)
           and bool_and(vault_secret_id is not null)
      into v_positive_ok
    from public.provider_credentials where id = v_positive_succ;

    select status into v_positive_status from public.provider_credentials where id = v_positive_pred;

    insert into cb0021_adversarial_results values
      ('CB21-R0', 'an ACTIVE predecessor rotates: the successor becomes active in the same rotation unit',
       'successor active, bound to the predecessor business/connection/type; predecessor superseded',
       case when v_positive_succ is not null and v_positive_ok and v_positive_status = 'superseded'
            then 'successor active and bound; predecessor ' || v_positive_status
            else 'rotation did not produce the certified shape' end,
       case when v_positive_succ is not null and v_positive_ok and v_positive_status = 'superseded' then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-R0', 'an ACTIVE predecessor rotates: the successor becomes active in the same rotation unit',
         'successor active, bound to the predecessor business/connection/type; predecessor superseded',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── the Vault window opens HERE: only the positive control has written a secret
  select count(*) into v_sb
  from public.provider_credentials c
  join vault.secrets s on s.id = c.vault_secret_id
  where c.business_connection_id in (conn_a, conn_b, conn_c);

  -- ══════════════════════════════════════════════════════════════════════════
  -- EVERY NON-ACTIVE STATE IS REFUSED (no Vault write in any of these)
  -- ══════════════════════════════════════════════════════════════════════════
  for i in 1..array_length(v_statuses, 1) loop
    begin
      insert into public.provider_credentials
        (business_connection_id, business_id, credential_type, status, revoked_at,
         created_at, expires_at)
      values
        (conn_a, biz_a, v_types[i], v_statuses[i],
         case when v_statuses[i] = 'revoked' then now() end,
         case when v_statuses[i] = 'expired' then now() - interval '2 days' else now() end,
         case when v_statuses[i] = 'expired' then now() - interval '1 day' else null end)
      returning id into v_negative_pred;

      begin
        perform public.provider_credential_rotate(v_negative_pred, v_life_secret);
        insert into cb0021_adversarial_results values
          (v_tags[i], 'a ' || v_statuses[i] || ' predecessor is refused',
           '42501 - only an active credential may be rotated',
           'ACCEPTED - DEFECT', 'FAIL');
      exception
        when others then
          v_msg := v_msg || '|' || sqlstate || ':' || sqlerrm;
          insert into cb0021_adversarial_results values
            (v_tags[i], 'a ' || v_statuses[i] || ' predecessor is refused',
             '42501 - only an active credential may be rotated',
             sqlstate || ' - rejected',
             case when sqlstate = '42501' then 'PASS' else 'FAIL' end);
      end;
    exception
      when others then
        insert into cb0021_adversarial_results values
          (v_tags[i], 'a ' || v_statuses[i] || ' predecessor is refused',
           '42501 - only an active credential may be rotated',
           'setup error: sqlstate ' || sqlstate, 'FAIL');
    end;
  end loop;

  -- ── CB21-R6 · a SUPERSEDED predecessor is refused ────────────────────────
  begin
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status, revoked_at)
    values (conn_a, biz_a, 'payroll_access', 'revoked', now())
    returning id into v_negative_target;

    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status, superseded_by_credential_id)
    values (conn_a, biz_a, 'payroll_access', 'superseded', v_negative_target)
    returning id into v_negative_pred;

    begin
      perform public.provider_credential_rotate(v_negative_pred, v_life_secret);
      insert into cb0021_adversarial_results values
        ('CB21-R6', 'a superseded predecessor is refused',
         '42501 - only an active credential may be rotated',
         'ACCEPTED - DEFECT', 'FAIL');
    exception
      when others then
        v_msg := v_msg || '|' || sqlstate || ':' || sqlerrm;
        insert into cb0021_adversarial_results values
          ('CB21-R6', 'a superseded predecessor is refused',
           '42501 - only an active credential may be rotated',
           sqlstate || ' - rejected',
           case when sqlstate = '42501' then 'PASS' else 'FAIL' end);
    end;
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-R6', 'a superseded predecessor is refused',
         '42501 - only an active credential may be rotated',
         'setup error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB21-R7 · a status outside the vocabulary cannot even be stored ──────
  begin
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status)
    values (conn_a, biz_a, 'crm_access', 'consumed');
    insert into cb0021_adversarial_results values
      ('CB21-R7', 'an unknown status cannot be stored at all (the CHECK holds the vocabulary)',
       '23514 - the status CHECK rejects a value outside the deployed vocabulary',
       'ACCEPTED - DEFECT', 'FAIL');
  exception
    when check_violation then
      insert into cb0021_adversarial_results values
        ('CB21-R7', 'an unknown status cannot be stored at all (the CHECK holds the vocabulary)',
         '23514 - the status CHECK rejects a value outside the deployed vocabulary',
         '23514 - rejected', 'PASS');
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-R7', 'an unknown status cannot be stored at all (the CHECK holds the vocabulary)',
         '23514 - the status CHECK rejects a value outside the deployed vocabulary',
         'rejected with unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB21-R8 · rotation does NOT destroy the predecessor's Vault material ─
  -- Reads the POSITIVE control's pair. No scratch variable from any other
  -- section is reachable from here, which is precisely what the first version of
  -- this suite got wrong: it read a row R6 had written and reported FAIL against
  -- a correct implementation.
  begin
    select count(*) into v_n
    from public.provider_credentials c
    join vault.secrets s on s.id = c.vault_secret_id
    where c.id = v_positive_pred or c.id = v_positive_succ;

    select (vault_secret_id is not null) into v_ok
    from public.provider_credentials where id = v_positive_pred;

    insert into cb0021_adversarial_results values
      ('CB21-R8', 'rotation preserves the predecessor Vault material (retirement is an explicit revoke)',
       'the predecessor row still references a secret that still exists in Vault',
       'predecessor reference intact=' || coalesce(v_ok, false)::text
         || '; live secret rows for this unit=' || v_n::text,
       case when v_ok and v_n = 2 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-R8', 'rotation preserves the predecessor Vault material (retirement is an explicit revoke)',
         'the predecessor row still references a secret that still exists in Vault',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB21-R9 · an identifier that does not resolve is refused ────────────
  begin
    perform public.provider_credential_rotate('00000000-0000-0000-0000-0000000c21ff', v_life_secret);
    insert into cb0021_adversarial_results values
      ('CB21-R9', 'a predecessor identifier that does not resolve is refused',
       '42501 - credential not found',
       'ACCEPTED - DEFECT', 'FAIL');
  exception
    when others then
      v_msg := v_msg || '|' || sqlstate || ':' || sqlerrm;
      insert into cb0021_adversarial_results values
        ('CB21-R9', 'a predecessor identifier that does not resolve is refused',
         '42501 - credential not found',
         sqlstate || ' - rejected',
         case when sqlstate = '42501' then 'PASS' else 'FAIL' end);
  end;

  -- ── the Vault window closes HERE: after the LAST refused rotate call ─────
  select count(*) into v_sa
  from public.provider_credentials c
  join vault.secrets s on s.id = c.vault_secret_id
  where c.business_connection_id in (conn_a, conn_b, conn_c);

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE SUCCESSOR CAN NEVER LEAVE THE PREDECESSOR'S UNIT (inheritance)
  -- Read from the POSITIVE control's pair, never from a scratch row.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    select c.business_id = p.business_id,
           c.business_connection_id = p.business_connection_id,
           c.credential_type = p.credential_type
      into v_inherit_business, v_inherit_connection, v_inherit_type
    from public.provider_credentials c
    join public.provider_credentials p on p.id = v_positive_pred
    where c.id = v_positive_succ;

    insert into cb0021_adversarial_results values
      ('CB21-B1', 'the successor business is INHERITED, never redirected',
       'successor.business_id = predecessor.business_id',
       'business inherited=' || coalesce(v_inherit_business, false)::text,
       case when v_inherit_business then 'PASS' else 'FAIL' end);

    insert into cb0021_adversarial_results values
      ('CB21-B2', 'the successor connection is INHERITED, never redirected',
       'successor.business_connection_id = predecessor.business_connection_id',
       'connection inherited=' || coalesce(v_inherit_connection, false)::text,
       case when v_inherit_connection then 'PASS' else 'FAIL' end);

    insert into cb0021_adversarial_results values
      ('CB21-B3', 'the successor credential type is INHERITED, never redirected',
       'successor.credential_type = predecessor.credential_type',
       'credential type inherited=' || coalesce(v_inherit_type, false)::text,
       case when v_inherit_type then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-B1', 'the successor business is INHERITED, never redirected',
         'successor.business_id = predecessor.business_id',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
      insert into cb0021_adversarial_results values
        ('CB21-B2', 'the successor connection is INHERITED, never redirected',
         'successor.business_connection_id = predecessor.business_connection_id',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
      insert into cb0021_adversarial_results values
        ('CB21-B3', 'the successor credential type is INHERITED, never redirected',
         'successor.credential_type = predecessor.credential_type',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE DATABASE REFUSES A CROSS-UNIT SUPERSESSION (CB-001.2 survives)
  -- Scratch identities only: these rows have nothing to do with the pair the
  -- positive assertions read, and they must never be able to displace it.
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB21-S1 · cross-business ─────────────────────────────────────────────
  if biz_b is null then
    insert into cb0021_adversarial_results values
      ('CB21-S1', 'a cross-business supersession is refused by the database',
       '23503 - the rotation-unit FK',
       'SKIPPED - a second business does not exist', 'SKIPPED');
  else
    begin
      insert into public.provider_credentials
        (business_connection_id, business_id, credential_type, status, revoked_at)
      values (conn_a, biz_a, 'crm_access', 'revoked', now())
      returning id into v_struct_pred;

      insert into public.provider_credentials
        (business_connection_id, business_id, credential_type, status, revoked_at)
      values (conn_c, biz_b, 'crm_access', 'revoked', now())
      returning id into v_struct_target;

      begin
        update public.provider_credentials
           set superseded_by_credential_id = v_struct_target
         where id = v_struct_pred;
        insert into cb0021_adversarial_results values
          ('CB21-S1', 'a cross-business supersession is refused by the database',
           '23503 - the rotation-unit FK',
           'ACCEPTED - DEFECT', 'FAIL');
      exception
        when foreign_key_violation then
          get stacked diagnostics v_constraint = constraint_name;
          insert into cb0021_adversarial_results values
            ('CB21-S1', 'a cross-business supersession is refused by the database',
             '23503 - the rotation-unit FK',
             '23503 / ' || coalesce(v_constraint, '<none>'), 'PASS');
        when others then
          insert into cb0021_adversarial_results values
            ('CB21-S1', 'a cross-business supersession is refused by the database',
             '23503 - the rotation-unit FK',
             'unexpected sqlstate ' || sqlstate, 'FAIL');
      end;
    exception
      when others then
        insert into cb0021_adversarial_results values
          ('CB21-S1', 'a cross-business supersession is refused by the database',
           '23503 - the rotation-unit FK',
           'setup error: sqlstate ' || sqlstate, 'FAIL');
    end;
  end if;

  -- ── CB21-S2 · cross-connection (same business) ───────────────────────────
  begin
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status, revoked_at)
    values (conn_b, biz_a, 'crm_access', 'revoked', now())
    returning id into v_struct_pred;

    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status, revoked_at)
    values (conn_a, biz_a, 'crm_access', 'revoked', now())
    returning id into v_struct_target;

    begin
      update public.provider_credentials
         set superseded_by_credential_id = v_struct_target
       where id = v_struct_pred;
      insert into cb0021_adversarial_results values
        ('CB21-S2', 'a cross-connection supersession is refused by the database',
         '23503 - the rotation-unit FK',
         'ACCEPTED - DEFECT', 'FAIL');
    exception
      when foreign_key_violation then
        get stacked diagnostics v_constraint = constraint_name;
        insert into cb0021_adversarial_results values
          ('CB21-S2', 'a cross-connection supersession is refused by the database',
           '23503 - the rotation-unit FK',
           '23503 / ' || coalesce(v_constraint, '<none>'), 'PASS');
      when others then
        insert into cb0021_adversarial_results values
          ('CB21-S2', 'a cross-connection supersession is refused by the database',
           '23503 - the rotation-unit FK',
           'unexpected sqlstate ' || sqlstate, 'FAIL');
    end;
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-S2', 'a cross-connection supersession is refused by the database',
         '23503 - the rotation-unit FK',
         'setup error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB21-S3 · cross-type (same connection) ───────────────────────────────
  begin
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status, revoked_at)
    values (conn_b, biz_a, 'payroll_access', 'revoked', now())
    returning id into v_struct_pred;

    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status, revoked_at)
    values (conn_b, biz_a, 'crm_access', 'revoked', now())
    returning id into v_struct_target;

    begin
      update public.provider_credentials
         set superseded_by_credential_id = v_struct_target
       where id = v_struct_pred;
      insert into cb0021_adversarial_results values
        ('CB21-S3', 'a cross-credential-type supersession is refused by the database',
         '23503 - the rotation-unit FK',
         'ACCEPTED - DEFECT', 'FAIL');
    exception
      when foreign_key_violation then
        get stacked diagnostics v_constraint = constraint_name;
        insert into cb0021_adversarial_results values
          ('CB21-S3', 'a cross-credential-type supersession is refused by the database',
           '23503 - the rotation-unit FK',
           '23503 / ' || coalesce(v_constraint, '<none>'), 'PASS');
      when others then
        insert into cb0021_adversarial_results values
          ('CB21-S3', 'a cross-credential-type supersession is refused by the database',
           '23503 - the rotation-unit FK',
           'unexpected sqlstate ' || sqlstate, 'FAIL');
    end;
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-S3', 'a cross-credential-type supersession is refused by the database',
         '23503 - the rotation-unit FK',
         'setup error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- AUTHORIZATION — the wrapper stays service_role-only, and usable
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB21-A1 · anon cannot execute ────────────────────────────────────────
  begin
    set local role anon;
    begin
      perform public.provider_credential_rotate(v_negative_pred, v_life_secret);
      insert into cb0021_adversarial_results values
        ('CB21-A1', 'anon cannot invoke provider_credential_rotate', 'insufficient_privilege',
         'INVOKED - DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb0021_adversarial_results values
          ('CB21-A1', 'anon cannot invoke provider_credential_rotate', 'insufficient_privilege',
           'insufficient_privilege raised', 'PASS');
    end;
    reset role;
  exception
    when others then
      reset role;
      insert into cb0021_adversarial_results values
        ('CB21-A1', 'anon cannot invoke provider_credential_rotate', 'insufficient_privilege',
         'could not assume role anon: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ── CB21-A2 · authenticated cannot execute ───────────────────────────────
  begin
    set local role authenticated;
    begin
      perform public.provider_credential_rotate(v_negative_pred, v_life_secret);
      insert into cb0021_adversarial_results values
        ('CB21-A2', 'authenticated cannot invoke provider_credential_rotate', 'insufficient_privilege',
         'INVOKED - DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb0021_adversarial_results values
          ('CB21-A2', 'authenticated cannot invoke provider_credential_rotate', 'insufficient_privilege',
           'insufficient_privilege raised', 'PASS');
    end;
    reset role;
  exception
    when others then
      reset role;
      insert into cb0021_adversarial_results values
        ('CB21-A2', 'authenticated cannot invoke provider_credential_rotate', 'insufficient_privilege',
         'could not assume role authenticated: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ── CB21-A3 · no wrapper is reachable by a browser role (catalog proof) ──
  begin
    select count(*) into v_reachable
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('provider_credential_put','provider_credential_rotate',
                        'provider_credential_resolve','provider_credential_revoke')
      and (
        p.proacl is null
        or exists (select 1 from aclexplode(p.proacl) a
                    where a.grantee = 0 and a.privilege_type = 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      );

    insert into cb0021_adversarial_results values
      ('CB21-A3', 'no credential wrapper is reachable by PUBLIC, anon or authenticated',
       '0 reachable wrappers', v_reachable::text || ' reachable wrapper(s)',
       case when v_reachable = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-A3', 'no credential wrapper is reachable by PUBLIC, anon or authenticated',
         '0 reachable wrappers', 'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB21-A4 · service_role CAN execute (positive capability) ────────────
  -- Its own pair, so the positive control's identities are never touched.
  begin
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status)
    values (conn_b, biz_a, 'quickbooks_access', 'active')
    returning id into v_auth_pred;

    set local role service_role;
    v_auth_succ := public.provider_credential_rotate(v_auth_pred, v_sr_secret);
    reset role;

    insert into cb0021_adversarial_results values
      ('CB21-A4', 'service_role CAN invoke the boundary (a lockdown that cannot be used is a lockout)',
       'an active predecessor rotates under service_role',
       case when v_auth_succ is null then 'no successor returned' else 'successor returned' end,
       case when v_auth_succ is not null then 'PASS' else 'FAIL' end);
  exception
    when others then
      reset role;
      insert into cb0021_adversarial_results values
        ('CB21-A4', 'service_role CAN invoke the boundary (a lockdown that cannot be used is a lockout)',
         'an active predecessor rotates under service_role',
         'rejected: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RESOLUTION — the unit yields the successor, and never the predecessor
  -- Addressed by the positive control's own unit, compared against the literal
  -- markers it used, so it cannot inherit a scratch row's meaning.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    select public.provider_credential_resolve(biz_a, conn_a, unit_type) into v_resolve;

    insert into cb0021_adversarial_results values
      ('CB21-V1', 'after a valid rotation the unit resolves to the SUCCESSOR',
       'the successor plaintext',
       case when v_resolve = v_succ_secret then 'successor plaintext returned' else 'NOT the successor' end,
       case when v_resolve = v_succ_secret then 'PASS' else 'FAIL' end);

    insert into cb0021_adversarial_results values
      ('CB21-V2', 'the SUPERSEDED predecessor never resolves, even though its material still exists',
       'the successor plaintext, never the predecessor plaintext',
       case when v_resolve is distinct from v_pred_secret and v_resolve = v_succ_secret
            then 'predecessor plaintext not returned' else 'PREDECESSOR LEAKED' end,
       case when v_resolve is distinct from v_pred_secret and v_resolve = v_succ_secret
            then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-V1', 'after a valid rotation the unit resolves to the SUCCESSOR',
         'the successor plaintext',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
      insert into cb0021_adversarial_results values
        ('CB21-V2', 'the SUPERSEDED predecessor never resolves, even though its material still exists',
         'the successor plaintext, never the predecessor plaintext',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE POSITIVE IDENTITIES SURVIVED EVERY SCRATCH SECTION (isolation proof)
  -- Runs AFTER every section that writes a scratch row. This is the assertion
  -- the first version of this suite could not make: it is what turns "no section
  -- overwrote the pair" from a reading of the source into a measured fact.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    select c.status, c.business_id, c.business_connection_id, c.credential_type,
           (c.vault_secret_id is not null)
      into v_pos_pred_status, v_pos_pred_business, v_pos_pred_connection, v_pos_pred_type, v_pos_pred_material
    from public.provider_credentials c
    where c.id = v_positive_pred;

    select c.status, c.business_id, c.business_connection_id, c.credential_type
      into v_pos_succ_status, v_pos_succ_business, v_pos_succ_connection, v_pos_succ_type
    from public.provider_credentials c
    where c.id = v_positive_succ;

    insert into cb0021_adversarial_results values
      ('CB21-R10', 'the positive-control identities survive every scratch section unchanged',
       'predecessor still superseded with its Vault reference; successor still active, in the same unit',
       'predecessor=' || coalesce(v_pos_pred_status, '<missing>')
         || ' material=' || coalesce(v_pos_pred_material, false)::text
         || '; successor=' || coalesce(v_pos_succ_status, '<missing>')
         || '; same unit=' || (v_pos_pred_business is not distinct from v_pos_succ_business
                              and v_pos_pred_connection is not distinct from v_pos_succ_connection
                              and v_pos_pred_type is not distinct from v_pos_succ_type)::text,
       case when v_pos_pred_status = 'superseded' and v_pos_pred_material
                 and v_pos_succ_status = 'active'
                 and v_pos_pred_business is not distinct from v_pos_succ_business
                 and v_pos_pred_connection is not distinct from v_pos_succ_connection
                 and v_pos_pred_type is not distinct from v_pos_succ_type
            then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-R10', 'the positive-control identities survive every scratch section unchanged',
         'predecessor still superseded with its Vault reference; successor still active, in the same unit',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- NO PLAINTEXT, NO UNINTENDED VAULT MATERIAL, NO FACT WRITE
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB21-N1 · no synthetic plaintext appears in the verdict output ──────
  begin
    select count(*) into v_n
    from cb0021_adversarial_results r
    where r.test_id || r.requirement || r.expected || r.observed
          like '%vision_test_secret_cb0021_%';

    insert into cb0021_adversarial_results values
      ('CB21-N1', 'no credential plaintext appears in any verdict row or captured error message',
       '0 verdict rows carrying a secret marker; 0 captured messages carrying one',
       'verdict rows=' || v_n::text
         || '; captured messages=' || case when position('vision_test_secret_cb0021_' in v_msg) > 0 then 'CARRY A MARKER' else '0' end,
       case when v_n = 0 and position('vision_test_secret_cb0021_' in v_msg) = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-N1', 'no credential plaintext appears in any verdict row or captured error message',
         '0 verdict rows carrying a secret marker; 0 captured messages carrying one',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB21-N2 · a refused rotation creates no Vault material ──────────────
  begin
    insert into cb0021_adversarial_results values
      ('CB21-N2', 'the refused rotations created ZERO Vault material (the gate precedes vault.create_secret)',
       'the live secret count is unchanged across every refusal',
       'before=' || v_sb::text || ', after=' || v_sa::text,
       case when v_sb = v_sa and v_sb = 2 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-N2', 'the refused rotations created ZERO Vault material (the gate precedes vault.create_secret)',
         'the live secret count is unchanged across every refusal',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB21-F1 · the Digital Twin fact freeze is untouched ─────────────────
  begin
    select (select count(*) from public.business_facts)
         + (select count(*) from public.business_fact_evidence)
         + (select count(*) from public.business_fact_conflicts)
      into v_n;

    insert into cb0021_adversarial_results values
      ('CB21-F1', 'the Digital Twin fact freeze remains 0 / 0 / 0 through the whole suite',
       'business_facts + business_fact_evidence + business_fact_conflicts = 0',
       'total fact rows=' || v_n::text,
       case when v_n = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb0021_adversarial_results values
        ('CB21-F1', 'the Digital Twin fact freeze remains 0 / 0 / 0 through the whole suite',
         'business_facts + business_fact_evidence + business_fact_conflicts = 0',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB21-C1 · cleanup is verdicted by the read-only companion ───────────
  insert into cb0021_adversarial_results values
    ('CB21-C1', 'no synthetic credential, connection or Vault secret survives the suite',
     '0 / 0 / 0 / 0 after ROLLBACK',
     'every synthetic row is confined to this uncommitted transaction; CB21-C1 is '
     || 'verdicted by the READ-ONLY companion residue check, run next',
     'MANUAL');
end $$;

-- ── REPORT (read this grid before the rollback) ─────────────────────────────
select test_id, requirement, expected, observed, verdict
from cb0021_adversarial_results
order by test_id;

rollback;