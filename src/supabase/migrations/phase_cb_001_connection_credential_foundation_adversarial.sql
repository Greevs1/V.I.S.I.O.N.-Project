-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-001 ADVERSARIAL TEST
-- ============================================================================
-- Proves the DATABASE enforces the invariants, not the application.
--
-- SAFETY DESIGN
--   • The file opens a transaction and contains NO COMMIT anywhere. Nothing it
--     inserts can ever be committed; an uncommitted transaction is discarded when
--     the session ends. The explicit `rollback;` after the report is the
--     deterministic form of the same guarantee.
--   • Every row it creates lives on a connection id inside the reserved namespace
--     00000000-0000-0000-0000-0000000c00xx, and carries a marked provider
--     organization id (realm_adv_* / item_adv_* / org_adv_* / org_bad_*). Residue
--     detection therefore depends on NO metadata marker — a row whose test was
--     EXPECTED to be rejected cannot hide behind its own metadata.
--   • It references two EXISTING business ids (the FK requires a real business).
--     It mutates nothing belonging to them and rolls back.
--   • Constraint enforcement is role-independent: FKs and CHECKs apply to the
--     table owner here exactly as they do to service_role. That is the point of
--     the test — the same-business rule must hold even for service_role.
--
-- HOW TO READ THIS — TWO EXECUTIONS, AND THE ROLLBACK IS NEVER TOUCHED
--   The SQL editor surfaces ONE result grid per execution: the last statement
--   that returned rows. The verdict grid is produced BEFORE the rollback, and
--   anything row-returning after the rollback would supersede it — which is
--   exactly what happened when the residue check lived at the end of this file.
--
--   So this file deliberately ENDS with the verdict grid. Its `rollback;` follows
--   the grid and returns NO rows, so it cannot hide the result. The residue
--   verification is a separate READ-ONLY companion, run immediately after:
--
--     STEP 1  this file                          → the T1 … T15 verdict grid
--     STEP 2  …_adversarial_residue.sql          → 0 / 0 / PASS (T11's verdict)
--
--   T12 … T15 are the CB-001.2 rotation-unit coverage: a successor credential
--   must stay inside its predecessor's rotation unit (same business_connection_id
--   AND same credential_type). Every REJECTION case asserts the SQLSTATE *and* the
--   CONSTRAINT_NAME that fired, so an unrelated constraint failing can never
--   produce a false PASS.
--
--   The grid prints in lexicographic test_id order (T1, T10, T11, T12, T13, T14,
--   T15, T2 … T9) — that is this artifact's own `order by test_id`, unchanged.
--
--   NEVER comment out, move, or bypass the `rollback;`. It is unconditional, it
--   always executes, and it is still the final statement of this file. Synthetic
--   rows live only inside that transaction: an uncommitted transaction is
--   discarded when the session ends, so nothing can survive either way.
-- ============================================================================

begin;

create temp table cb001_adversarial_results (
  test_id     text,
  requirement text,
  expected    text,
  observed    text,
  verdict     text
) on commit drop;

do $$
declare
  biz_a    uuid;
  biz_b    uuid;
  conn_t1  uuid := '00000000-0000-0000-0000-0000000c0001';
  conn_t4  uuid := '00000000-0000-0000-0000-0000000c0004';
  conn_t5a uuid := '00000000-0000-0000-0000-0000000c0005';
  conn_t5b uuid := '00000000-0000-0000-0000-0000000c0006';
  conn_t6  uuid := '00000000-0000-0000-0000-0000000c0007';
  conn_t8  uuid := '00000000-0000-0000-0000-0000000c0008';
  conn_t9  uuid := '00000000-0000-0000-0000-0000000c0009';
  conn_t10 uuid := '00000000-0000-0000-0000-0000000c000a';

  -- CB-001.2 rotation-unit coverage (T12 … T15). Every id stays inside the
  -- reserved synthetic namespace 00000000-0000-0000-0000-0000000c00xx that the
  -- residue companion scans, so any survival is detectable.
  conn_t12  uuid := '00000000-0000-0000-0000-0000000c000b';
  conn_t13a uuid := '00000000-0000-0000-0000-0000000c000c';
  conn_t13b uuid := '00000000-0000-0000-0000-0000000c000d';
  conn_t14a uuid := '00000000-0000-0000-0000-0000000c000e';
  conn_t14b uuid := '00000000-0000-0000-0000-0000000c000f';
  conn_t15  uuid := '00000000-0000-0000-0000-0000000c0010';
  cr_t12_x  uuid := '00000000-0000-0000-0000-0000000c00e1';
  cr_t12_y  uuid := '00000000-0000-0000-0000-0000000c00e2';
  cr_t13_x  uuid := '00000000-0000-0000-0000-0000000c00e3';
  cr_t13_y  uuid := '00000000-0000-0000-0000-0000000c00e4';
  cr_t14_x  uuid := '00000000-0000-0000-0000-0000000c00e5';
  cr_t14_y  uuid := '00000000-0000-0000-0000-0000000c00e6';
  cr_t15_x  uuid := '00000000-0000-0000-0000-0000000c00e7';
  cr_t15_y  uuid := '00000000-0000-0000-0000-0000000c00e8';

  v_constraint text;
  v_ok         boolean;
begin
  select id into biz_a from public.business_entities order by id limit 1;
  select id into biz_b from public.business_entities where id <> biz_a order by id limit 1;

  if biz_a is null or biz_b is null then
    insert into cb001_adversarial_results values
      ('T0', 'preconditions', 'two distinct business ids exist', 'insufficient businesses', 'SKIPPED');
    return;
  end if;

  -- ── T1 · Cross-business credential reference is rejected ──────────────────
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
      values (conn_t1, biz_a, 'plaid', 'banking', 'item_adv_cross', 'active');
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type)
      values (conn_t1, biz_b, 'plaid_access');
    insert into cb001_adversarial_results values
      ('T1', 'cross-business credential reference', 'composite FK rejects it', 'ACCEPTED — DEFECT', 'FAIL');
  exception
    when foreign_key_violation then
      insert into cb001_adversarial_results values
        ('T1', 'cross-business credential reference', 'composite FK rejects it',
         'foreign_key_violation raised', 'PASS');
    when others then
      insert into cb001_adversarial_results values
        ('T1', 'cross-business credential reference', 'composite FK rejects it',
         'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T2 · Invalid provider is rejected ─────────────────────────────────────
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id)
      values (gen_random_uuid(), biz_a, 'not_a_provider', 'other', 'org_bad_provider');
    insert into cb001_adversarial_results values
      ('T2', 'invalid provider rejected', 'check_violation', 'ACCEPTED — DEFECT', 'FAIL');
  exception
    when check_violation then
      insert into cb001_adversarial_results values
        ('T2', 'invalid provider rejected', 'check_violation', 'check_violation raised', 'PASS');
    when others then
      insert into cb001_adversarial_results values
        ('T2', 'invalid provider rejected', 'check_violation', 'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T3 · Invalid connection status is rejected ────────────────────────────
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
      values (gen_random_uuid(), biz_a, 'plaid', 'banking', 'org_bad_status', 'zombie');
    insert into cb001_adversarial_results values
      ('T3', 'invalid connection status rejected', 'check_violation', 'ACCEPTED — DEFECT', 'FAIL');
  exception
    when check_violation then
      insert into cb001_adversarial_results values
        ('T3', 'invalid connection status rejected', 'check_violation', 'check_violation raised', 'PASS');
    when others then
      insert into cb001_adversarial_results values
        ('T3', 'invalid connection status rejected', 'check_violation', 'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T4 · Invalid credential status is rejected ────────────────────────────
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
      values (conn_t4, biz_a, 'plaid', 'banking', 'item_adv_status', 'active');
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status)
      values (conn_t4, biz_a, 'plaid_access', 'nonsense');
    insert into cb001_adversarial_results values
      ('T4', 'invalid credential status rejected', 'check_violation', 'ACCEPTED — DEFECT', 'FAIL');
  exception
    when check_violation then
      insert into cb001_adversarial_results values
        ('T4', 'invalid credential status rejected', 'check_violation', 'check_violation raised', 'PASS');
    when others then
      insert into cb001_adversarial_results values
        ('T4', 'invalid credential status rejected', 'check_violation', 'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T5 · Same provider organization cannot be duplicated for one business ──
  insert into public.business_connections
    (id, business_id, provider, connection_category, provider_organization_id, status)
    values (conn_t5a, biz_a, 'quickbooks', 'accounting', 'realm_adv_dup', 'active');
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
      values (conn_t5b, biz_a, 'quickbooks', 'accounting', 'realm_adv_dup', 'active');
    insert into cb001_adversarial_results values
      ('T5', 'duplicate (business, provider, organization)', 'unique_violation', 'ACCEPTED — DEFECT', 'FAIL');
  exception
    when unique_violation then
      insert into cb001_adversarial_results values
        ('T5', 'duplicate (business, provider, organization)', 'unique_violation', 'unique_violation raised', 'PASS');
    when others then
      insert into cb001_adversarial_results values
        ('T5', 'duplicate (business, provider, organization)', 'unique_violation',
         'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T6 · Valid lifecycle metadata IS accepted ─────────────────────────────
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status,
       capabilities, metadata_safe)
      values (conn_t6, biz_a, 'quickbooks', 'accounting', 'realm_adv_ok', 'active',
              '{"read": true}'::jsonb, '{"environment": "sandbox"}'::jsonb);
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status, expires_at, rotation_metadata_safe)
      values (conn_t6, biz_a, 'quickbooks_refresh', 'active', now() + interval '30 days',
              '{"rotation_reason": "adversarial_test", "provider_version": 2}'::jsonb);

    if exists (select 1 from public.provider_credentials
                 where business_connection_id = conn_t6 and status = 'active')
       and exists (select 1 from public.business_connections
                     where id = conn_t6 and updated_at is not null)
    then
      insert into cb001_adversarial_results values
        ('T6', 'valid lifecycle metadata accepted by the admin test context',
         'inserted, readable, updated_at set', 'inserted and readable', 'PASS');
    else
      insert into cb001_adversarial_results values
        ('T6', 'valid lifecycle metadata accepted by the admin test context',
         'inserted, readable, updated_at set', 'row not readable', 'FAIL');
    end if;
  exception
    when others then
      insert into cb001_adversarial_results values
        ('T6', 'valid lifecycle metadata accepted by the admin test context',
         'inserted, readable, updated_at set', 'rejected: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T7 · metadata_safe may not carry a top-level access_token ─────────────
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status, metadata_safe)
      values (gen_random_uuid(), biz_a, 'plaid', 'banking', 'item_adv_meta_token', 'active',
              '{"access_token": "plaintext-would-be-secret"}'::jsonb);
    insert into cb001_adversarial_results values
      ('T7', 'metadata_safe rejects a top-level access_token key', 'check_violation',
       'ACCEPTED — DEFECT', 'FAIL');
  exception
    when check_violation then
      insert into cb001_adversarial_results values
        ('T7', 'metadata_safe rejects a top-level access_token key', 'check_violation',
         'check_violation raised', 'PASS');
    when others then
      insert into cb001_adversarial_results values
        ('T7', 'metadata_safe rejects a top-level access_token key', 'check_violation',
         'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T8 · rotation_metadata_safe may not carry a top-level refresh_token ───
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
      values (conn_t8, biz_a, 'quickbooks', 'accounting', 'realm_adv_rotation_token', 'active');
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, rotation_metadata_safe)
      values (conn_t8, biz_a, 'quickbooks_refresh',
              '{"refresh_token": "plaintext-would-be-secret"}'::jsonb);
    insert into cb001_adversarial_results values
      ('T8', 'rotation_metadata_safe rejects a top-level refresh_token key', 'check_violation',
       'ACCEPTED — DEFECT', 'FAIL');
  exception
    when check_violation then
      insert into cb001_adversarial_results values
        ('T8', 'rotation_metadata_safe rejects a top-level refresh_token key', 'check_violation',
         'check_violation raised', 'PASS');
    when others then
      insert into cb001_adversarial_results values
        ('T8', 'rotation_metadata_safe rejects a top-level refresh_token key', 'check_violation',
         'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T9 · legitimate safe metadata is still ACCEPTED ───────────────────────
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status, metadata_safe)
      values (conn_t9, biz_a, 'plaid', 'banking', 'item_adv_safe_meta', 'active',
              '{"environment": "sandbox", "provider_version": 2}'::jsonb);
    if exists (select 1 from public.business_connections
                 where id = conn_t9
                   and metadata_safe ->> 'environment' = 'sandbox'
                   and (metadata_safe ->> 'provider_version')::int = 2)
    then
      insert into cb001_adversarial_results values
        ('T9', 'safe metadata_safe accepted (no over-blocking)', 'inserted and readable',
         'inserted and readable', 'PASS');
    else
      insert into cb001_adversarial_results values
        ('T9', 'safe metadata_safe accepted (no over-blocking)', 'inserted and readable',
         'not readable', 'FAIL');
    end if;
  exception
    when others then
      insert into cb001_adversarial_results values
        ('T9', 'safe metadata_safe accepted (no over-blocking)', 'inserted and readable',
         'rejected: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T10 · rotation metadata that merely MENTIONS a token is accepted ──────
  -- The deny-list is exact-key membership. `token_expires_at` is not the key
  -- `token`, so bookkeeping about expiry must remain storable — a substring
  -- matcher would reject exactly what rotation needs to record.
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
      values (conn_t10, biz_a, 'quickbooks', 'accounting', 'realm_adv_safe_rotation', 'active');
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, rotation_metadata_safe)
      values (conn_t10, biz_a, 'quickbooks_refresh',
              '{"rotation_reason": "scheduled", "token_expires_at": "2026-01-01T00:00:00Z"}'::jsonb);
    if exists (select 1 from public.provider_credentials
                 where business_connection_id = conn_t10
                   and rotation_metadata_safe ->> 'rotation_reason' = 'scheduled'
                   and rotation_metadata_safe ->> 'token_expires_at' = '2026-01-01T00:00:00Z')
    then
      insert into cb001_adversarial_results values
        ('T10', 'rotation metadata naming token_expires_at accepted (no substring over-blocking)',
         'inserted and readable', 'inserted and readable', 'PASS');
    else
      insert into cb001_adversarial_results values
        ('T10', 'rotation metadata naming token_expires_at accepted (no substring over-blocking)',
         'inserted and readable', 'not readable', 'FAIL');
    end if;
  exception
    when others then
      insert into cb001_adversarial_results values
        ('T10', 'rotation metadata naming token_expires_at accepted (no substring over-blocking)',
         'inserted and readable', 'rejected: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- CB-001.2 · ROTATION-UNIT SUPERSESSION INTEGRITY (T12 … T15)
  --
  -- The invariant: a successor must live in the SAME rotation unit as its
  -- predecessor — same business_connection_id AND same credential_type. Same
  -- business is enforced both directly (retained FK) and transitively (a
  -- credential's business is fixed by its connection).
  --
  -- Every rejection case asserts the SQLSTATE *and* the CONSTRAINT_NAME that
  -- fired. An unrelated FK failing is a FAIL, not a pass by coincidence.
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── T12 · Same rotation unit: supersession is ACCEPTED ────────────────────
  -- X and Y share one connection and one credential_type. X starts 'pending'
  -- because one_active_idx permits only one ACTIVE credential per rotation unit —
  -- the test follows the real rotation protocol rather than fighting the index.
  -- PASS requires a read-back proving BOTH the status AND the pointer, not merely
  -- that the UPDATE returned without error.
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
      values (conn_t12, biz_a, 'quickbooks', 'accounting', 'realm_adv_t12', 'active');

    insert into public.provider_credentials
      (id, business_connection_id, business_id, credential_type, status)
      values
        (cr_t12_x, conn_t12, biz_a, 'quickbooks_refresh', 'pending'),
        (cr_t12_y, conn_t12, biz_a, 'quickbooks_refresh', 'active');

    update public.provider_credentials
      set status = 'superseded', superseded_by_credential_id = cr_t12_y
      where id = cr_t12_x;

    select (status = 'superseded' and superseded_by_credential_id = cr_t12_y)
      into v_ok
      from public.provider_credentials
      where id = cr_t12_x;

    if v_ok is true then
      insert into cb001_adversarial_results values
        ('T12', 'same rotation unit supersession accepted',
         'status=superseded and superseded_by_credential_id=successor',
         'status=superseded and pointer=successor', 'PASS');
    else
      insert into cb001_adversarial_results values
        ('T12', 'same rotation unit supersession accepted',
         'status=superseded and superseded_by_credential_id=successor',
         'read-back mismatch', 'FAIL');
    end if;
  exception
    when others then
      insert into cb001_adversarial_results values
        ('T12', 'same rotation unit supersession accepted',
         'status=superseded and superseded_by_credential_id=successor',
         'rejected: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T13 · Same business, DIFFERENT connection: REJECTED ───────────────────
  -- Two QuickBooks realms for one business. Business matches, connection does not,
  -- so the rotation-unit FK is the ONLY constraint that can fire — and the test
  -- asserts that exact name.
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
      values
        (conn_t13a, biz_a, 'quickbooks', 'accounting', 'realm_adv_t13a', 'active'),
        (conn_t13b, biz_a, 'quickbooks', 'accounting', 'realm_adv_t13b', 'active');

    insert into public.provider_credentials
      (id, business_connection_id, business_id, credential_type, status)
      values
        (cr_t13_x, conn_t13a, biz_a, 'quickbooks_refresh', 'pending'),
        (cr_t13_y, conn_t13b, biz_a, 'quickbooks_refresh', 'active');

    update public.provider_credentials
      set status = 'superseded', superseded_by_credential_id = cr_t13_y
      where id = cr_t13_x;

    insert into cb001_adversarial_results values
      ('T13', 'cross-connection supersession rejected',
       '23503 + provider_credentials_superseded_same_rotation_unit_fkey',
       'ACCEPTED — DEFECT', 'FAIL');
  exception
    when foreign_key_violation then
      get stacked diagnostics v_constraint = constraint_name;
      insert into cb001_adversarial_results values
        ('T13', 'cross-connection supersession rejected',
         '23503 + provider_credentials_superseded_same_rotation_unit_fkey',
         '23503 / ' || coalesce(v_constraint, '<none>'),
         case when v_constraint = 'provider_credentials_superseded_same_rotation_unit_fkey'
              then 'PASS' else 'FAIL' end);
    when others then
      insert into cb001_adversarial_results values
        ('T13', 'cross-connection supersession rejected',
         '23503 + provider_credentials_superseded_same_rotation_unit_fkey',
         'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T14 · DIFFERENT business: REJECTED by a business-enforcing FK ─────────
  -- A different business implies a different connection (one connection belongs to
  -- exactly one business), so BOTH business-enforcing supersession FKs are
  -- violated. The assertion accepts exactly those two names — and nothing else.
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
      values
        (conn_t14a, biz_a, 'quickbooks', 'accounting', 'realm_adv_t14a', 'active'),
        (conn_t14b, biz_b, 'quickbooks', 'accounting', 'realm_adv_t14b', 'active');

    insert into public.provider_credentials
      (id, business_connection_id, business_id, credential_type, status)
      values
        (cr_t14_x, conn_t14a, biz_a, 'quickbooks_refresh', 'pending'),
        (cr_t14_y, conn_t14b, biz_b, 'quickbooks_refresh', 'active');

    update public.provider_credentials
      set status = 'superseded', superseded_by_credential_id = cr_t14_y
      where id = cr_t14_x;

    insert into cb001_adversarial_results values
      ('T14', 'cross-business supersession rejected',
       '23503 + a business-enforcing supersession FK',
       'ACCEPTED — DEFECT', 'FAIL');
  exception
    when foreign_key_violation then
      get stacked diagnostics v_constraint = constraint_name;
      insert into cb001_adversarial_results values
        ('T14', 'cross-business supersession rejected',
         '23503 + a business-enforcing supersession FK',
         '23503 / ' || coalesce(v_constraint, '<none>'),
         case when v_constraint in ('provider_credentials_superseded_same_business_fkey',
                                    'provider_credentials_superseded_same_rotation_unit_fkey')
              then 'PASS' else 'FAIL' end);
    when others then
      insert into cb001_adversarial_results values
        ('T14', 'cross-business supersession rejected',
         '23503 + a business-enforcing supersession FK',
         'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T15 · Same connection, DIFFERENT credential_type: REJECTED ────────────
  -- Business and connection both match, so the retained same-business FK is
  -- satisfied and cannot fire. The credential_type mismatch is the ONLY
  -- difference, so a rotation-unit FK violation is the only acceptable outcome.
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
      values (conn_t15, biz_a, 'quickbooks', 'accounting', 'realm_adv_t15', 'active');

    insert into public.provider_credentials
      (id, business_connection_id, business_id, credential_type, status)
      values
        (cr_t15_x, conn_t15, biz_a, 'quickbooks_refresh', 'pending'),
        (cr_t15_y, conn_t15, biz_a, 'quickbooks_access', 'active');

    update public.provider_credentials
      set status = 'superseded', superseded_by_credential_id = cr_t15_y
      where id = cr_t15_x;

    insert into cb001_adversarial_results values
      ('T15', 'cross-credential-type supersession rejected',
       '23503 + provider_credentials_superseded_same_rotation_unit_fkey',
       'ACCEPTED — DEFECT', 'FAIL');
  exception
    when foreign_key_violation then
      get stacked diagnostics v_constraint = constraint_name;
      insert into cb001_adversarial_results values
        ('T15', 'cross-credential-type supersession rejected',
         '23503 + provider_credentials_superseded_same_rotation_unit_fkey',
         '23503 / ' || coalesce(v_constraint, '<none>'),
         case when v_constraint = 'provider_credentials_superseded_same_rotation_unit_fkey'
              then 'PASS' else 'FAIL' end);
    when others then
      insert into cb001_adversarial_results values
        ('T15', 'cross-credential-type supersession rejected',
         '23503 + provider_credentials_superseded_same_rotation_unit_fkey',
         'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── T11 · Cleanup (renumbered from T7) ────────────────────────────────────
  insert into cb001_adversarial_results values
    ('T11', 'no residue survives the test',
     '0 rows after ROLLBACK',
     'all synthetic rows are confined to this uncommitted transaction; '
     || 'T11 is verdict-ed by the READ-ONLY companion residue check, run next',
     'MANUAL');
end $$;

-- ── REPORT (read this grid before the rollback) ─────────────────────────────
select test_id, requirement, expected, observed, verdict
from cb001_adversarial_results
order by test_id;

rollback;