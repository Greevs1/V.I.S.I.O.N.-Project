-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-002 ADVERSARIAL TEST — VAULT CREDENTIAL WRAPPERS
-- ============================================================================
-- Proves the DATABASE and the wrappers enforce the invariants, not the caller.
--
-- SYNTHETIC ONLY. Every secret this file creates is the literal marker
--   vision_test_secret_cb002_<random>
-- No real Plaid token, no real QuickBooks token, no real Xero or Wave token, no
-- real password, no real customer material. Nothing here can be replayed against
-- a provider, because nothing here is a credential.
--
-- SAFETY DESIGN
--   • The file opens a transaction and contains NO COMMIT anywhere. Every row AND
--     every Vault secret it creates lives inside that transaction, and
--     vault.create_secret is an ordinary INSERT into vault.secrets — so the single
--     `rollback;` at the end destroys the synthetic Vault material together with
--     the synthetic rows. An uncommitted transaction is discarded when the session
--     ends even if the rollback never ran.
--   • Every synthetic connection id lives in the reserved namespace
--     00000000-0000-0000-0000-0000000c02xx, so the READ-ONLY residue companion can
--     prove afterwards that nothing survived — including Vault material, which is
--     matched either as an orphan or through its synthetic connection.
--   • It creates its own synthetic connections and never touches a real one.
--   • It uses ONE existing business id, because the credential FK requires a real
--     business. It mutates nothing belonging to it and rolls back.
--
-- HOW TO READ THIS — TWO EXECUTIONS, AND THE ROLLBACK IS NEVER TOUCHED
--   The SQL editor surfaces ONE grid per execution: the last statement that
--   returned rows. The verdict grid is produced BEFORE the rollback, and anything
--   row-returning after it would supersede it. So this file ENDS with the grid.
--   Its `rollback;` follows the grid and returns NO rows, so it cannot hide the
--   result. Residue verification is a separate READ-ONLY companion, run next:
--
--     STEP 1  this file                            → the CB2-* verdict grid
--     STEP 2  …_adversarial_residue.sql            → 0 / 0 / 0 / PASS
--
--   NEVER comment out, move, or bypass the `rollback;`. It is unconditional and it
--   is still the final statement of this file.
--
-- ROLE TESTS AND THE SKIPPED VERDICT
--   CB2-U1/U2/U4 switch role with SET LOCAL ROLE and then call a wrapper, which is
--   the only way to test EXECUTE privilege BEHAVIOURALLY rather than by reading a
--   catalog. If the session role cannot assume the target role, the row reports
--   SKIPPED — never PASS. A false PASS is worse than an honest skip, and CB2-U3
--   proves the same property from the catalog unconditionally.
--
--   The grid prints in lexicographic test_id order — this artifact's own
--   `order by test_id`, unchanged.
-- ============================================================================

begin;

create temp table cb002_adversarial_results (
  test_id     text,
  requirement text,
  expected    text,
  observed    text,
  verdict     text
) on commit drop;

do $$
declare
  biz_a uuid;

  -- Reserved synthetic namespace. 0c02xx is the CB-002 block; CB-001 used 0c00xx
  -- and 0c01xx is deliberately left unused so the two suites can never collide.
  conn_p1  uuid := '00000000-0000-0000-0000-0000000c0201';
  conn_r4  uuid := '00000000-0000-0000-0000-0000000c0202';
  conn_r5  uuid := '00000000-0000-0000-0000-0000000c0203';
  conn_r6  uuid := '00000000-0000-0000-0000-0000000c0204';
  conn_x1  uuid := '00000000-0000-0000-0000-0000000c0205';
  conn_x2a uuid := '00000000-0000-0000-0000-0000000c0206';
  conn_x2b uuid := '00000000-0000-0000-0000-0000000c0207';
  conn_x3  uuid := '00000000-0000-0000-0000-0000000c0208';
  conn_v1  uuid := '00000000-0000-0000-0000-0000000c0209';
  conn_v2  uuid := '00000000-0000-0000-0000-0000000c020a';
  conn_u4  uuid := '00000000-0000-0000-0000-0000000c020b';

  v_secret_p1  text;
  v_secret_r4  text;
  v_secret_r5a text;
  v_secret_r5b text;
  v_secret_r6  text;
  v_secret_x1a text;
  v_secret_x1b text;
  v_secret_v1  text;
  v_secret_v2a text;
  v_secret_v2b text;
  v_secret_u4  text;

  v_id          uuid;
  v_id2         uuid;
  v_secret_name text;
  v_resolved    text;
  v_ok          boolean;
  v_rejected    integer := 0;
  v_bad         integer := 0;
  v_constraint  text;
  v_status      text;
  v_pointer     uuid;
  v_vault_ref   uuid;
  v_left        integer;
begin
  select id into biz_a from public.business_entities order by id limit 1;

  if biz_a is null then
    insert into cb002_adversarial_results values
      ('CB2-U0', 'preconditions', 'one existing business id', 'no business exists', 'SKIPPED');
    return;
  end if;

  -- Obviously-fake material. Each value is unique so a leak is attributable.
  v_secret_p1  := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');
  v_secret_r4  := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');
  v_secret_r5a := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');
  v_secret_r5b := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');
  v_secret_r6  := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');
  v_secret_x1a := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');
  v_secret_x1b := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');
  v_secret_v1  := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');
  v_secret_v2a := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');
  v_secret_v2b := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');
  v_secret_u4  := 'vision_test_secret_cb002_' || replace(gen_random_uuid()::text, '-', '');

  -- Synthetic connections, one per test. Distinct provider organizations, so the
  -- CB-001 identity unique constraint is never the thing under test here.
  insert into public.business_connections
    (id, business_id, provider, connection_category, provider_organization_id, status)
  values
    (conn_p1,  biz_a, 'plaid',      'banking',    'item_cb002_p1',  'active'),
    (conn_r4,  biz_a, 'plaid',      'banking',    'item_cb002_r4',  'active'),
    (conn_r5,  biz_a, 'plaid',      'banking',    'item_cb002_r5',  'active'),
    (conn_r6,  biz_a, 'quickbooks', 'accounting', 'realm_cb002_r6', 'active'),
    (conn_x1,  biz_a, 'quickbooks', 'accounting', 'realm_cb002_x1', 'active'),
    (conn_x2a, biz_a, 'quickbooks', 'accounting', 'realm_cb002_x2a','active'),
    (conn_x2b, biz_a, 'quickbooks', 'accounting', 'realm_cb002_x2b','active'),
    (conn_x3,  biz_a, 'quickbooks', 'accounting', 'realm_cb002_x3', 'active'),
    (conn_v1,  biz_a, 'quickbooks', 'accounting', 'realm_cb002_v1', 'active'),
    (conn_v2,  biz_a, 'quickbooks', 'accounting', 'realm_cb002_v2', 'active'),
    (conn_u4,  biz_a, 'plaid',      'banking',    'item_cb002_u4',  'active');

  -- ══════════════════════════════════════════════════════════════════════════
  -- U — unauthorized roles cannot reach the wrappers
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB2-U1 · anon cannot invoke the wrapper ───────────────────────────────
  begin
    set local role anon;
    begin
      perform public.provider_credential_put(biz_a, conn_u4, 'plaid_access', v_secret_u4);
      insert into cb002_adversarial_results values
        ('CB2-U1', 'anon cannot invoke provider_credential_put', 'insufficient_privilege',
         'INVOKED — DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb002_adversarial_results values
          ('CB2-U1', 'anon cannot invoke provider_credential_put', 'insufficient_privilege',
           'insufficient_privilege raised', 'PASS');
    end;
    reset role;
  exception
    when others then
      reset role;
      insert into cb002_adversarial_results values
        ('CB2-U1', 'anon cannot invoke provider_credential_put', 'insufficient_privilege',
         'could not assume role anon: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ── CB2-U2 · authenticated cannot invoke the wrapper ──────────────────────
  begin
    set local role authenticated;
    begin
      perform public.provider_credential_put(biz_a, conn_u4, 'plaid_access', v_secret_u4);
      insert into cb002_adversarial_results values
        ('CB2-U2', 'authenticated cannot invoke provider_credential_put', 'insufficient_privilege',
         'INVOKED — DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb002_adversarial_results values
          ('CB2-U2', 'authenticated cannot invoke provider_credential_put', 'insufficient_privilege',
           'insufficient_privilege raised', 'PASS');
    end;
    reset role;
  exception
    when others then
      reset role;
      insert into cb002_adversarial_results values
        ('CB2-U2', 'authenticated cannot invoke provider_credential_put', 'insufficient_privilege',
         'could not assume role authenticated: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ── CB2-U3 · no browser role holds EXECUTE on ANY wrapper (catalog) ───────
  -- This is the unconditional form of U1/U2 and it also covers PUBLIC, which has
  -- no role to assume. A NULL proacl means the DEFAULT applies — which INCLUDES
  -- PUBLIC EXECUTE — so NULL is counted as a defect, never as clean.
  select count(*) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('provider_credential_put', 'provider_credential_rotate',
                      'provider_credential_resolve', 'provider_credential_revoke')
    and (
      p.proacl is null
      or exists (select 1 from aclexplode(p.proacl) a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );

  insert into cb002_adversarial_results values
    ('CB2-U3', 'no wrapper is reachable by PUBLIC, anon or authenticated', '0 reachable wrappers',
     v_bad::text || ' reachable wrapper(s)',
     case when v_bad = 0 then 'PASS' else 'FAIL' end);

  -- ── CB2-U4 · service_role CAN invoke the wrapper (positive capability) ────
  -- The complement of U1/U2. A lockdown that cannot be used is a lockout.
  begin
    set local role service_role;
    v_id := public.provider_credential_put(biz_a, conn_u4, 'plaid_access', v_secret_u4);
    reset role;

    select (count(*) = 1 and bool_and(vault_secret_id is not null)) into v_ok
      from public.provider_credentials where id = v_id;

    insert into cb002_adversarial_results values
      ('CB2-U4', 'service_role CAN invoke provider_credential_put', 'credential created, reference set',
       case when v_ok then 'credential created, reference set' else 'call returned but row is wrong' end,
       case when v_id is not null and v_ok then 'PASS' else 'FAIL' end);
  exception
    when others then
      reset role;
      insert into cb002_adversarial_results values
        ('CB2-U4', 'service_role CAN invoke provider_credential_put', 'credential created, reference set',
         'rejected: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- P — put: the stored row, the Vault reference, and the absence of plaintext
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB2-P1 · a valid synthetic put creates the row ────────────────────────
  begin
    v_id := public.provider_credential_put(biz_a, conn_p1, 'plaid_access', v_secret_p1);

    select (count(*) = 1
            and bool_and(status = 'active')
            and bool_and(business_id = biz_a)
            and bool_and(business_connection_id = conn_p1)
            and bool_and(credential_type = 'plaid_access')
            and bool_and(expires_at is null))
      into v_ok
    from public.provider_credentials where id = v_id;

    insert into cb002_adversarial_results values
      ('CB2-P1', 'put creates an active credential bound to business and connection',
       'id returned, status=active, binding exact',
       case when v_id is not null and v_ok then 'id returned, status=active, binding exact'
            else 'row missing or binding wrong' end,
       case when v_id is not null and v_ok then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-P1', 'put creates an active credential bound to business and connection',
         'id returned, status=active, binding exact', 'rejected: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-P2 · the row carries an opaque reference and NO plaintext ─────────
  -- The synthetic value must not appear ANYWHERE in the stored row — not in a
  -- column, not in metadata, not in the serialized record. The reference must be
  -- a uuid, which is an opaque handle and not the material.
  begin
    select (vault_secret_id is not null
            and (select count(*) from vault.secrets s where s.id = c.vault_secret_id) = 1
            and row_to_json(c)::text not like '%' || v_secret_p1 || '%')
      into v_ok
    from public.provider_credentials c
    where c.id = v_id;

    insert into cb002_adversarial_results values
      ('CB2-P2', 'stored row holds an opaque Vault reference and no plaintext',
       'reference resolves to a live secret, plaintext absent from the row',
       case when v_ok then 'reference live, plaintext absent'
            else 'reference or plaintext defect' end,
       case when v_ok then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-P2', 'stored row holds an opaque Vault reference and no plaintext',
         'reference resolves to a live secret, plaintext absent from the row',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-P3 · the Vault secret name is opaque and carries no identity ─────
  -- The name must be exactly vision-provider-credential:{credential_uuid} and must
  -- NOT contain the provider name, the business id, the connection id, the
  -- provider organization id, or the business's own name — even though all of
  -- those are known here and could be checked for.
  begin
    select s.name into v_secret_name
    from vault.secrets s
    join public.provider_credentials c on c.vault_secret_id = s.id
    where c.id = v_id;

    select (v_secret_name = 'vision-provider-credential:' || v_id::text
            and position('plaid' in v_secret_name) = 0
            and position('quickbooks' in v_secret_name) = 0
            and position(conn_p1::text in v_secret_name) = 0
            and position(biz_a::text in v_secret_name) = 0
            and position('item_cb002' in v_secret_name) = 0)
      into v_ok;

    insert into cb002_adversarial_results values
      ('CB2-P3', 'Vault secret name is opaque: credential uuid only, no provider or business identity',
       'vision-provider-credential:{credential_uuid}',
       coalesce(v_secret_name, '<no secret>'),
       case when v_ok then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-P3', 'Vault secret name is opaque: credential uuid only, no provider or business identity',
         'vision-provider-credential:{credential_uuid}',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- R — resolve: the server-side path, and every way it must refuse
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB2-R1 · the server-side path returns the material ───────────────────
  begin
    v_resolved := public.provider_credential_resolve(biz_a, conn_p1, 'plaid_access');
    insert into cb002_adversarial_results values
      ('CB2-R1', 'resolve returns the active credential plaintext for its own rotation unit',
       'the stored synthetic value',
       case when v_resolved = v_secret_p1 then 'value returned'
            when v_resolved is null then 'null returned'
            else 'a different value was returned' end,
       case when v_resolved = v_secret_p1 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-R1', 'resolve returns the active credential plaintext for its own rotation unit',
         'the stored synthetic value', 'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-R2 · a wrong business cannot resolve ─────────────────────────────
  -- An unrelated business uuid, which is what a caller with a borrowed credential
  -- id would supply. Must be indistinguishable from "nothing here".
  begin
    v_resolved := public.provider_credential_resolve(gen_random_uuid(), conn_p1, 'plaid_access');
    insert into cb002_adversarial_results values
      ('CB2-R2', 'resolve rejects a business that does not own the connection', 'null',
       case when v_resolved is null then 'null' else 'a value was returned' end,
       case when v_resolved is null then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-R2', 'resolve rejects a business that does not own the connection', 'null',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-R3 · a wrong connection cannot resolve ───────────────────────────
  begin
    v_resolved := public.provider_credential_resolve(biz_a, '00000000-0000-0000-0000-0000000c02ff', 'plaid_access');
    insert into cb002_adversarial_results values
      ('CB2-R3', 'resolve rejects a connection with no active credential', 'null',
       case when v_resolved is null then 'null' else 'a value was returned' end,
       case when v_resolved is null then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-R3', 'resolve rejects a connection with no active credential', 'null',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-R4 · a revoked credential cannot resolve ─────────────────────────
  begin
    v_id := public.provider_credential_put(biz_a, conn_r4, 'plaid_access', v_secret_r4);
    perform public.provider_credential_revoke(v_id, biz_a, conn_r4);
    v_resolved := public.provider_credential_resolve(biz_a, conn_r4, 'plaid_access');
    insert into cb002_adversarial_results values
      ('CB2-R4', 'a revoked credential cannot resolve', 'null',
       case when v_resolved is null then 'null' else 'a value was returned' end,
       case when v_resolved is null then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-R4', 'a revoked credential cannot resolve', 'null',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-R5 · a superseded credential cannot resolve ──────────────────────
  -- Resolution is addressed by ROTATION UNIT, never by credential id, so the test
  -- is exact: after a rotation the unit must yield the SUCCESSOR's material and
  -- must never yield the SUPERSEDED predecessor's material.
  begin
    v_id := public.provider_credential_put(biz_a, conn_r5, 'plaid_access', v_secret_r5a);
    v_id2 := public.provider_credential_rotate(v_id, v_secret_r5b);
    v_resolved := public.provider_credential_resolve(biz_a, conn_r5, 'plaid_access');

    select (v_resolved = v_secret_r5b and v_resolved <> v_secret_r5a) into v_ok;
    insert into cb002_adversarial_results values
      ('CB2-R5', 'a superseded credential cannot resolve; the unit yields only the successor',
       'successor material, never predecessor material',
       case when v_ok then 'successor material returned'
            when v_resolved is null then 'null returned'
            else 'predecessor material or unexpected value returned' end,
       case when v_ok then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-R5', 'a superseded credential cannot resolve; the unit yields only the successor',
         'successor material, never predecessor material',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-R6 · a stale (expired) credential cannot resolve ─────────────────
  -- Staleness is judged with clock_timestamp(), so this is testable: a credential
  -- that is resolvable now must stop being resolvable once it expires.
  begin
    v_id := public.provider_credential_put(
      biz_a, conn_r6, 'quickbooks_refresh', v_secret_r6,
      clock_timestamp() + interval '1 second');

    v_ok := public.provider_credential_resolve(biz_a, conn_r6, 'quickbooks_refresh') = v_secret_r6;

    perform pg_sleep(2);

    v_resolved := public.provider_credential_resolve(biz_a, conn_r6, 'quickbooks_refresh');

    insert into cb002_adversarial_results values
      ('CB2-R6', 'a stale credential resolves before expiry and never after it', 'resolved, then null',
       case when not v_ok then 'not resolvable while still fresh'
            when v_resolved is null then 'resolved while fresh, null after expiry'
            else 'resolved even after expiry — DEFECT' end,
       case when v_ok and v_resolved is null then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-R6', 'a stale credential resolves before expiry and never after it', 'resolved, then null',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-R7 · malformed input is rejected ─────────────────────────────────
  -- Three inputs, each of which must fail loudly rather than store anything: an
  -- empty secret, an unknown credential type, and a type that belongs to a
  -- DIFFERENT provider than the connection. All three must raise 22023.
  v_rejected := 0;

  begin
    perform public.provider_credential_put(biz_a, conn_p1, 'plaid_access', '');
  exception
    when others then if sqlstate = '22023' then v_rejected := v_rejected + 1; end if;
  end;

  begin
    perform public.provider_credential_put(biz_a, conn_p1, 'not_a_credential_type', 'x');
  exception
    when others then if sqlstate = '22023' then v_rejected := v_rejected + 1; end if;
  end;

  begin
    perform public.provider_credential_put(biz_a, conn_r6, 'plaid_access', 'x');
  exception
    when others then if sqlstate = '22023' then v_rejected := v_rejected + 1; end if;
  end;

  insert into cb002_adversarial_results values
    ('CB2-R7', 'malformed input is rejected (blank secret, unknown type, wrong-provider type)',
     '3 of 3 rejected with 22023', v_rejected::text || ' of 3 rejected with 22023',
     case when v_rejected = 3 then 'PASS' else 'FAIL' end);

  -- ══════════════════════════════════════════════════════════════════════════
  -- X — rotation stays inside the rotation unit (CB-001.2), by construction
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB2-X1 · the successor inherits connection AND credential_type ────────
  -- The caller cannot supply either, so a cross-connection or cross-type successor
  -- is not merely rejected — it is unrepresentable. Proven by reading the successor
  -- row back and comparing it to the predecessor.
  begin
    v_id := public.provider_credential_put(biz_a, conn_x1, 'quickbooks_refresh', v_secret_x1a);
    v_id2 := public.provider_credential_rotate(v_id, v_secret_x1b);

    select (s.business_connection_id = p.business_connection_id
            and s.credential_type = p.credential_type
            and s.business_id = p.business_id
            and p.status = 'superseded'
            and p.superseded_by_credential_id = s.id
            and s.status = 'active')
      into v_ok
    from public.provider_credentials p
    join public.provider_credentials s on s.id = v_id2
    where p.id = v_id;

    insert into cb002_adversarial_results values
      ('CB2-X1', 'rotate binds the successor to the predecessor business_connection_id and credential_type',
       'successor inherits connection and type; predecessor superseded and pointing at it',
       case when v_ok then 'unit inherited exactly; predecessor superseded' else 'rotation binding defect' end,
       case when v_ok then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-X1', 'rotate binds the successor to the predecessor business_connection_id and credential_type',
         'successor inherits connection and type; predecessor superseded and pointing at it',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-X2 · the database backstop still refuses cross-unit supersession ──
  -- A direct write that bypasses the wrappers, aimed across connections. It must be
  -- refused BY THE FK, and the constraint that fired must be named — so an
  -- unrelated constraint cannot produce a pass by coincidence.
  begin
    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status)
      values (conn_x2a, biz_a, 'quickbooks_refresh', 'pending');

    insert into public.provider_credentials
      (business_connection_id, business_id, credential_type, status)
      values (conn_x2b, biz_a, 'quickbooks_refresh', 'active');

    update public.provider_credentials p
       set status = 'superseded',
           superseded_by_credential_id = (
             select c.id from public.provider_credentials c
              where c.business_connection_id = conn_x2b and c.status = 'active' limit 1)
     where p.business_connection_id = conn_x2a and p.status = 'pending';

    insert into cb002_adversarial_results values
      ('CB2-X2', 'cross-connection supersession is still refused by the CB-001.2 FK',
       '23503 + provider_credentials_superseded_same_rotation_unit_fkey',
       'ACCEPTED — DEFECT', 'FAIL');
  exception
    when foreign_key_violation then
      get stacked diagnostics v_constraint = constraint_name;
      insert into cb002_adversarial_results values
        ('CB2-X2', 'cross-connection supersession is still refused by the CB-001.2 FK',
         '23503 + provider_credentials_superseded_same_rotation_unit_fkey',
         '23503 / ' || coalesce(v_constraint, '<none>'),
         case when v_constraint = 'provider_credentials_superseded_same_rotation_unit_fkey'
              then 'PASS' else 'FAIL' end);
    when others then
      insert into cb002_adversarial_results values
        ('CB2-X2', 'cross-connection supersession is still refused by the CB-001.2 FK',
         '23503 + provider_credentials_superseded_same_rotation_unit_fkey',
         'unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-X3 · rotate refuses a terminal predecessor ───────────────────────
  -- A revoked credential and a superseded credential are both history. Replacing
  -- either would rewrite provenance, so rotate must refuse both with 42501.
  v_rejected := 0;

  begin
    v_id := public.provider_credential_put(biz_a, conn_x3, 'quickbooks_refresh', v_secret_r5a);
    perform public.provider_credential_revoke(v_id, biz_a, conn_x3);
    begin
      v_id2 := public.provider_credential_rotate(v_id, v_secret_r5b);
    exception
      when others then if sqlstate = '42501' then v_rejected := v_rejected + 1; end if;
    end;

    v_id := public.provider_credential_put(biz_a, conn_x3, 'quickbooks_access', v_secret_v2a);
    v_id2 := public.provider_credential_rotate(v_id, v_secret_v2b);
    begin
      perform public.provider_credential_rotate(v_id, v_secret_r5b);
    exception
      when others then if sqlstate = '42501' then v_rejected := v_rejected + 1; end if;
    end;

    insert into cb002_adversarial_results values
      ('CB2-X3', 'rotate refuses a revoked predecessor and a superseded predecessor',
       '2 of 2 rejected with 42501', v_rejected::text || ' of 2 rejected with 42501',
       case when v_rejected = 2 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-X3', 'rotate refuses a revoked predecessor and a superseded predecessor',
         '2 of 2 rejected with 42501', 'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- V — revoke retires material without destroying history
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB2-V1 · revoke destroys material, nulls the reference, keeps the row ─
  begin
    v_id := public.provider_credential_put(biz_a, conn_v1, 'quickbooks_refresh', v_secret_v1);
    select vault_secret_id into v_vault_ref from public.provider_credentials where id = v_id;

    perform public.provider_credential_revoke(v_id, biz_a, conn_v1);

    select status, vault_secret_id, revoked_at is not null into v_status, v_vault_ref, v_ok
    from public.provider_credentials where id = v_id;

    select count(*) into v_left from vault.secrets s
     where s.name = 'vision-provider-credential:' || v_id::text;

    insert into cb002_adversarial_results values
      ('CB2-V1', 'revoke destroys the Vault material, clears the reference and keeps the row',
       'status=revoked, revoked_at set, reference null, secret gone, row present',
       'status=' || coalesce(v_status, '<none>')
         || ', reference=' || case when v_vault_ref is null then 'null' else 'set' end
         || ', secret rows=' || v_left::text
         || ', row present=' || case when v_status is null then 'no' else 'yes' end,
       case when v_status = 'revoked' and v_ok and v_vault_ref is null and v_left = 0
            then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-V1', 'revoke destroys the Vault material, clears the reference and keeps the row',
         'status=revoked, revoked_at set, reference null, secret gone, row present',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB2-V2 · revoking a superseded credential preserves its provenance ────
  -- The material is retired, but the status stays 'superseded' and the supersession
  -- pointer survives: how rotation actually happened is not erased by a later
  -- cleanup.
  begin
    v_id := public.provider_credential_put(biz_a, conn_v2, 'quickbooks_access', v_secret_v2a);
    v_id2 := public.provider_credential_rotate(v_id, v_secret_v2b);

    -- v_id is now superseded; retire its dead material explicitly.
    perform public.provider_credential_revoke(v_id, biz_a, conn_v2);

    select status, superseded_by_credential_id, vault_secret_id
      into v_status, v_pointer, v_vault_ref
    from public.provider_credentials where id = v_id;

    select count(*) into v_left from vault.secrets s
     where s.name = 'vision-provider-credential:' || v_id::text;

    insert into cb002_adversarial_results values
      ('CB2-V2', 'revoking a superseded credential retires material and preserves provenance',
       'status still superseded, pointer intact, reference null, secret gone',
       'status=' || coalesce(v_status, '<none>')
         || ', pointer=' || case when v_pointer is null then 'null' else 'set' end
         || ', reference=' || case when v_vault_ref is null then 'null' else 'set' end
         || ', secret rows=' || v_left::text,
       case when v_status = 'superseded' and v_pointer is not null
                 and v_vault_ref is null and v_left = 0
            then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb002_adversarial_results values
        ('CB2-V2', 'revoking a superseded credential retires material and preserves provenance',
         'status still superseded, pointer intact, reference null, secret gone',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- C — cleanup
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB2-C1 · no synthetic material survives ──────────────────────────────
  insert into cb002_adversarial_results values
    ('CB2-C1', 'no synthetic row or synthetic Vault secret survives the test',
     '0 / 0 / 0 after ROLLBACK',
     'all synthetic rows and all synthetic Vault material are confined to this '
     || 'uncommitted transaction; CB2-C1 is verdict-ed by the READ-ONLY companion '
     || 'residue check, run next',
     'MANUAL');
end $$;

-- ── REPORT (read this grid before the rollback) ─────────────────────────────
select test_id, requirement, expected, observed, verdict
from cb002_adversarial_results
order by test_id;

rollback;