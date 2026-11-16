-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-003 ADVERSARIAL TEST — PROVIDER AUTHORIZATION ATTEMPTS
-- ============================================================================
-- Proves the DATABASE and the four CB-003 functions enforce the invariants, not
-- the caller.
--
-- SYNTHETIC ONLY. No provider is contacted; no OAuth flow runs; no credential of
-- any kind is created, requested or stored. The only "state" values here are
-- literals of VISION's CANONICAL RAW-STATE SHAPE — 43-character unpadded
-- base64url — and their sole purpose is to prove they are NEVER stored, inside
-- the reserved synthetic namespace:
--     vision_test_state_cb003_...
--
-- ── WHY THE DIGESTS ARE LITERALS ────────────────────────────────────────────
--   CB-003 does not compute hashes — Postgres is deliberately given no hashing
--   dependency, and the raw state never reaches the database at all. So this
--   suite supplies KNOWN digest literals and proves the CONTRACT the future
--   backend must satisfy: only the canonical 64-lowercase-hex DIGEST
--   REPRESENTATION is accepted, only the stored digest resolves, and no value in
--   VISION's canonical 43-character raw-state representation can satisfy the
--   digest constraint even when one is presented.
--   That proves REPRESENTATION, not provenance: a shape test cannot prove the
--   digest was computed, and a value of arbitrary 64-lowercase-hex shape is still
--   accepted. Computing SHA-256 remains the backend's duty.
--   Every synthetic digest is a repeating hex byte-pair — repeat('XX', 32) —
--   which is a real SHA-256 digest only if all 32 byte-pairs are identical. That
--   property is what the READ-ONLY residue companion keys on.
--
-- SAFETY DESIGN
--   • ONE begin, NO COMMIT anywhere, ONE unconditional final rollback. Every row
--     this file writes lives inside that transaction; an uncommitted transaction
--     is discarded when the session ends even if the rollback never ran.
--   • CB-003 writes no Vault material, so there is nothing here whose rollback
--     could be doubted: the two tables written are ordinary public tables under
--     MVCC. The residue companion still MEASURES the outcome rather than
--     inferring it.
--   • Synthetic connections live in the reserved namespace
--     00000000-0000-0000-0000-0000000c03xx. CB-001 used 0c00xx and CB-002 used
--     0c02xx; 0c01xx remains deliberately unused.
--   • It creates its own synthetic connections and never touches a real one.
--   • It uses ONE existing business and ONE existing profile, because the FKs
--     require real rows. It mutates nothing belonging to either, and rolls back.
--
-- ── THE CERTIFIED CONSTRAINT NAME IS LONGER THAN POSTGRESQL CAN STORE ──────
--   The certified same-business FK is DECLARED as
--     provider_authorization_attempts_result_connection_same_business_fkey
--   which is 68 characters. PostgreSQL truncates EVERY identifier to
--   NAMEDATALEN-1 = 63 BYTES, so a deployed database does not store that name —
--   it stores the 63-byte prefix, and GET STACKED DIAGNOSTICS returns the stored
--   name unchanged, because its CONSTRAINT_NAME item is TEXT.
--   The declared spelling therefore lives in exactly ONE place, v_fk_declared,
--   and the expected STORED name is DERIVED from it as left(v_fk_declared, 63).
--   CB3-20 re-derives the constraint's identity STRUCTURALLY from the catalog and
--   compares names through an EXPLICIT conname::text cast, because a name-typed
--   comparison truncates the literal as well and hides a disagreement of exactly
--   this kind. CB3-21 then requires the constraint that FIRED to equal the
--   catalog-derived name, so the rejection is still proved to come from the
--   certified same-business composite FK and from nothing else.
--
-- PRECONDITIONS — HONEST, NOT ASSUMED
--   A real business id AND a real profile id must exist (the FKs demand them).
--   If either is absent the suite reports a single SKIPPED precondition row and
--   does nothing else, rather than fabricating a business or profile row whose
--   required columns this artifact cannot know.
--   A SECOND business is needed only for the behavioural cross-business test; if
--   it is absent that one row reports SKIPPED, and the constraint itself is still
--   proved unconditionally from the catalog by CB3-20.
--
-- HOW TO READ THIS — TWO EXECUTIONS, AND THE ROLLBACK IS NEVER TOUCHED
--     STEP 1  this file                     → the CB3-* verdict grid
--     STEP 2  …_adversarial_residue.sql     → 0 / 0 / PASS
--   The verdict grid is the last row-returning statement, BEFORE the rollback, so
--   the single grid the editor surfaces IS the verdict. `rollback;` follows it and
--   returns no rows, so it cannot hide the result.
--   NEVER comment out, move, or bypass the `rollback;`.
--
-- ROLE TESTS AND THE SKIPPED VERDICT
--   CB3-23/CB3-24 switch role with SET LOCAL ROLE to test EXECUTE privilege
--   BEHAVIOURALLY. If the session role cannot assume the target role, the row
--   reports SKIPPED — never PASS. CB3-22 proves the same property from the catalog
--   unconditionally, so a skip costs nothing.
-- ============================================================================

begin;

create temp table cb003_adversarial_results (
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
  actor_a  uuid;

  v_provider text := 'plaid';
  v_category text := 'banking';
  v_target   text := '/connections/callback';

  -- VISION's CANONICAL RAW-STATE REPRESENTATION: 32 random bytes encoded as
  -- unpadded base64url, i.e. exactly 43 characters. These two literals have that
  -- exact shape (the real value is generated by the backend in CB-004). Their job
  -- is to be REJECTED when presented where a digest belongs, and to be provably
  -- absent from every row afterwards.
  v_raw_a text := 'vision_test_state_cb003_alpha_0123456789zzz';
  v_raw_b text := 'vision_test_state_cb003_beta_9876543210yyyy';

  -- Distinct synthetic digests: a repeating hex byte-pair, 64 characters.
  v_h_main      text := repeat('3c', 32);
  v_h_wrong     text := repeat('4d', 32);
  v_h_tampered  text := repeat('3c', 31) || 'ff';
  v_h_expired   text := repeat('5e', 32);
  v_h_cancelled text := repeat('6f', 32);
  v_h_failed    text := repeat('7a', 32);
  v_h_twice     text := repeat('8b', 32);
  v_h_repeat    text := repeat('a1', 32);
  v_h_same      text := repeat('d1', 32);
  v_h_cross     text := repeat('d2', 32);
  v_h_bad1      text := repeat('3c', 31) || '3';        -- 63 characters
  v_h_bad2      text := repeat('zz', 32);               -- 64 non-hex characters
  v_h_target_a  text := repeat('b1', 32);
  v_h_target_b  text := repeat('b2', 32);
  v_h_target_c  text := repeat('b3', 32);
  v_h_target_d  text := repeat('b4', 32);
  v_h_target_e  text := repeat('b5', 32);
  v_h_target_f  text := repeat('b6', 32);
  v_h_target_g  text := repeat('b7', 32);
  v_h_provider  text := repeat('c1', 32);
  v_h_category  text := repeat('c2', 32);

  v_past      timestamptz;
  v_attempt   uuid;
  v_expired   uuid;
  v_conn_same  uuid := '00000000-0000-0000-0000-0000000c0301';
  v_conn_other uuid := '00000000-0000-0000-0000-0000000c0302';

  v_n          integer;
  v_ok         boolean;
  v_rejected   integer;
  v_constraint text;
  v_count      integer;
  v_left       integer;

  -- ── the certified same-business FK identity ──────────────────────────────
  -- DECLARED in the migration as a 68-character name. PostgreSQL truncates every
  -- identifier to NAMEDATALEN-1 = 63 BYTES, so the name a deployed database
  -- STORES — and the name GET STACKED DIAGNOSTICS returns, whose CONSTRAINT_NAME
  -- item is TEXT and is never truncated on comparison — is the 63-byte prefix.
  -- The declared name is held ONCE here and the expected stored name is DERIVED
  -- from it with the same rule PostgreSQL applies, so the two cannot drift.
  v_fk_declared text := 'provider_authorization_attempts_result_connection_same_business_fkey';
  v_fk_expected text := left(v_fk_declared, 63);
  v_fk_name     text;
  v_fk_count    integer;

  v_ret_id      uuid;
  v_ret_biz     uuid;
  v_ret_profile uuid;
  v_ret_target  text;
  v_ret_prov    text;
  v_ret_cat     text;
begin
  -- ── preconditions ─────────────────────────────────────────────────────────
  select id into biz_a from public.business_entities order by id limit 1;
  select id into biz_b from public.business_entities where id is distinct from biz_a order by id limit 1;
  select id into actor_a from public.profiles order by id limit 1;

  if biz_a is null or actor_a is null then
    insert into cb003_adversarial_results values
      ('CB3-U0', 'preconditions (one existing business id AND one existing profile id)',
       'both present',
       'business=' || case when biz_a is null then 'none' else 'present' end
         || ', profile=' || case when actor_a is null then 'none' else 'present' end,
       'SKIPPED');
    return;
  end if;

  -- ── the certified same-business constraint identity, read ONCE from the catalog
  -- The identity is proved by STRUCTURE — one FK from the attempts table to
  -- business_connections with the exact ordered column mapping — and only the NAME
  -- is read from the catalog, so CB3-20 and CB3-21 cannot disagree about which
  -- constraint they are talking about. The ordering makes the read deterministic;
  -- CB3-20 separately fails if more than one constraint matches this identity.
  select c.conname::text into v_fk_name
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid = 'public.provider_authorization_attempts'::regclass
    and c.confrelid = 'public.business_connections'::regclass
    and (select array_agg(a.attname::text order by k.ord)
           from unnest(c.conkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
        = array['result_connection_id', 'business_id']
    and (select array_agg(a.attname::text order by k.ord)
           from unnest(c.confkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
        = array['id', 'business_id']
  order by c.conname::text
  limit 1;

  -- ══════════════════════════════════════════════════════════════════════════
  -- CREATION
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB3-01 · a valid attempt is created, bound, and expires in ten minutes ─
  begin
    v_attempt := public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_main, v_target);

    select (count(*) = 1
            and bool_and(status = 'pending')
            and bool_and(business_id = biz_a)
            and bool_and(initiated_by_profile_id = actor_a)
            and bool_and(provider = v_provider)
            and bool_and(connection_category = v_category)
            and bool_and(return_target = v_target)
            and bool_and(used_at is null)
            and bool_and(result_connection_id is null)
            and bool_and(failure_class is null)
            and bool_and(expires_at = created_at + interval '10 minutes')
            and bool_and(attempt_nonce is not null))
      into v_ok
    from public.provider_authorization_attempts where id = v_attempt;

    insert into cb003_adversarial_results values
      ('CB3-01', 'a valid attempt is created bound to its business, actor, provider and category, expiring in exactly ten minutes',
       'id returned; pending; binding exact; expires_at = created_at + 10 minutes',
       case when v_attempt is not null and v_ok then 'created; binding exact; ten-minute expiry exact'
            else 'row missing or binding/expiry wrong' end,
       case when v_attempt is not null and v_ok then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-01', 'a valid attempt is created bound to its business, actor, provider and category, expiring in exactly ten minutes',
         'id returned; pending; binding exact; expires_at = created_at + 10 minutes',
         'rejected: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-02 · VISION's CANONICAL RAW state is refused as the lookup key ───
  -- The central storage claim, stated precisely: the value presented here is a
  -- valid 43-character unpadded-base64url RAW state, and it is REFUSED, because
  -- the column accepts only the 64-lowercase-hex DIGEST representation. The two
  -- canonical representations are disjoint by construction, so a raw state is a
  -- rejection rather than a silent write. This proves REPRESENTATION, not
  -- provenance.
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_raw_a, v_target);
    insert into cb003_adversarial_results values
      ('CB3-02', 'the canonical 43-char raw-state representation is refused by the digest-shape constraint',
       '23514 — the raw-state representation cannot satisfy the digest constraint',
       'ACCEPTED — DEFECT', 'FAIL');
  exception
    when check_violation then
      insert into cb003_adversarial_results values
        ('CB3-02', 'the canonical 43-char raw-state representation is refused by the digest-shape constraint',
         '23514 — the raw-state representation cannot satisfy the digest constraint',
         '23514 — rejected', 'PASS');
    when others then
      insert into cb003_adversarial_results values
        ('CB3-02', 'the canonical 43-char raw-state representation is refused by the digest-shape constraint',
         '23514 — the raw-state representation cannot satisfy the digest constraint',
         'rejected with unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-03 · no raw state and no credential-shaped column exists ──────────
  begin
    select row_to_json(a)::text not like '%' || v_raw_a || '%'
           and row_to_json(a)::text not like '%' || v_raw_b || '%'
      into v_ok
    from public.provider_authorization_attempts a where a.id = v_attempt;

    select count(*) into v_count
    from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_authorization_attempts'
      and column_name in ('state', 'raw_state', 'state_value', 'state_token', 'raw', 'oauth_state');

    insert into cb003_adversarial_results values
      ('CB3-03', 'no raw state material persists and no raw-state column exists',
       'no canonical raw-state value in the serialized row; 0 raw-state columns',
       'canonical raw-state value present=' || case when v_ok then 'no' else 'YES' end
         || ', raw-state columns=' || v_count::text,
       case when v_ok and v_count = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-03', 'no raw state material persists and no raw-state column exists',
         'no canonical raw-state value in the serialized row; 0 raw-state columns',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RESOLUTION — only the exact stored digest resolves
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB3-04 · the correct digest resolves and RETURNS THE BOUND IDENTITY ───
  begin
    select count(*), (array_agg(r.attempt_id))[1], (array_agg(r.business_id))[1],
           (array_agg(r.initiated_by_profile_id))[1], (array_agg(r.provider))[1],
           (array_agg(r.connection_category))[1], (array_agg(r.return_target))[1]
      into v_n, v_ret_id, v_ret_biz, v_ret_profile, v_ret_prov, v_ret_cat, v_ret_target
    from public.provider_authorization_attempt_consume(v_provider, v_h_main) r;

    insert into cb003_adversarial_results values
      ('CB3-04', 'the correct digest consumes the attempt and returns the identity it was bound to',
       '1 row: attempt, business, actor, provider, category and return_target all as bound',
       v_n::text || ' row(s); '
         || 'business=' || case when v_ret_biz = biz_a then 'bound' else 'WRONG' end
         || ', actor=' || case when v_ret_profile = actor_a then 'bound' else 'WRONG' end
         || ', provider=' || case when v_ret_prov = v_provider then 'bound' else 'WRONG' end
         || ', category=' || case when v_ret_cat = v_category then 'bound' else 'WRONG' end
         || ', return_target=' || case when v_ret_target = v_target then 'bound' else 'WRONG' end,
       case when v_n = 1 and v_ret_id = v_attempt and v_ret_biz = biz_a and v_ret_profile = actor_a
                 and v_ret_prov = v_provider and v_ret_cat = v_category and v_ret_target = v_target
            then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-04', 'the correct digest consumes the attempt and returns the identity it was bound to',
         '1 row: attempt, business, actor, provider, category and return_target all as bound',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-05 · a wrong digest resolves nothing ──────────────────────────────
  begin
    select count(*) into v_n
    from public.provider_authorization_attempt_consume(v_provider, v_h_wrong) r;
    insert into cb003_adversarial_results values
      ('CB3-05', 'a wrong digest resolves nothing', '0 rows',
       v_n::text || ' row(s)', case when v_n = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-05', 'a wrong digest resolves nothing', '0 rows',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-06 · a tampered digest resolves nothing ───────────────────────────
  begin
    select count(*) into v_n
    from public.provider_authorization_attempt_consume(v_provider, v_h_tampered) r;
    insert into cb003_adversarial_results values
      ('CB3-06', 'a tampered digest (same shape, one byte-pair altered) resolves nothing', '0 rows',
       v_n::text || ' row(s)', case when v_n = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-06', 'a tampered digest (same shape, one byte-pair altered) resolves nothing', '0 rows',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- EXPIRY AND TERMINAL STATES — none of them is consumable
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB3-07 · an EXPIRED attempt cannot be consumed ────────────────────────
  -- Built with the ten-minute invariant INTACT (created_at 11 minutes ago), so
  -- this proves expiry end-to-end without corrupting a single rule. That is
  -- possible only because the invariant is on the DIFFERENCE, not on the clock.
  begin
    v_past := clock_timestamp() - interval '11 minutes';
    insert into public.provider_authorization_attempts
      (provider, connection_category, business_id, initiated_by_profile_id,
       state_hash, status, return_target, created_at, expires_at)
    values
      (v_provider, v_category, biz_a, actor_a,
       v_h_expired, 'pending', v_target, v_past, v_past + interval '10 minutes')
    returning id into v_expired;

    select count(*) into v_n
    from public.provider_authorization_attempt_consume(v_provider, v_h_expired) r;

    insert into cb003_adversarial_results values
      ('CB3-07', 'an expired attempt cannot be consumed (expiry judged at call time, invariant intact)',
       '0 rows, and the attempt remains pending',
       v_n::text || ' row(s); stored status=' || (select status from public.provider_authorization_attempts where id = v_expired),
       case when v_n = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-07', 'an expired attempt cannot be consumed (expiry judged at call time, invariant intact)',
         '0 rows, and the attempt remains pending',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-08 · a CANCELLED attempt cannot be consumed ──────────────────────
  begin
    v_attempt := public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_cancelled, v_target);
    perform public.provider_authorization_attempt_cancel(v_attempt, biz_a);

    select count(*) into v_n
    from public.provider_authorization_attempt_consume(v_provider, v_h_cancelled) r;

    insert into cb003_adversarial_results values
      ('CB3-08', 'a cancelled attempt cannot be consumed', '0 rows',
       v_n::text || ' row(s)', case when v_n = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-08', 'a cancelled attempt cannot be consumed', '0 rows',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-09 · a FAILED attempt cannot be consumed ─────────────────────────
  begin
    v_attempt := public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_failed, v_target);
    perform public.provider_authorization_attempt_fail(v_attempt, biz_a, 'provider_error');

    select count(*) into v_n
    from public.provider_authorization_attempt_consume(v_provider, v_h_failed) r;

    insert into cb003_adversarial_results values
      ('CB3-09', 'a failed attempt cannot be consumed', '0 rows',
       v_n::text || ' row(s)', case when v_n = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-09', 'a failed attempt cannot be consumed', '0 rows',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-10 · a USED attempt cannot be consumed twice ─────────────────────
  begin
    v_attempt := public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_twice, v_target);

    select count(*) into v_n
    from public.provider_authorization_attempt_consume(v_provider, v_h_twice) r;
    v_ok := (v_n = 1);

    select count(*) into v_n
    from public.provider_authorization_attempt_consume(v_provider, v_h_twice) r;

    insert into cb003_adversarial_results values
      ('CB3-10', 'a used attempt cannot be consumed a second time',
       'first consumption 1 row, second consumption 0 rows',
       'first=' || case when v_ok then '1' else 'NOT 1' end
         || ', second=' || v_n::text,
       case when v_ok and v_n = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-10', 'a used attempt cannot be consumed a second time',
         'first consumption 1 row, second consumption 0 rows',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-11 · logically repeated consumption yields exactly ONE success ───
  -- Sequential here, but the guarantee is structural, not scheduling: consumption
  -- is ONE UPDATE whose predicate requires status='pending'. A concurrent consumer
  -- blocks on the row lock, re-evaluates the predicate against the updated row and
  -- matches nothing — so a second success is impossible by construction. This row
  -- counts successes across repeated calls; it does not claim to have raced them.
  begin
    v_attempt := public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_repeat, v_target);

    v_rejected := 0;
    for v_count in 1..3 loop
      select count(*) into v_n
      from public.provider_authorization_attempt_consume(v_provider, v_h_repeat) r;
      if v_n = 1 then v_rejected := v_rejected + 1; end if;
    end loop;

    select count(*) into v_left
    from public.provider_authorization_attempts
    where id = v_attempt and status = 'used' and used_at is not null;

    insert into cb003_adversarial_results values
      ('CB3-11', 'repeated consumption attempts yield exactly ONE success (single-statement, row-locked)',
       '3 calls, 1 success, row used exactly once',
       v_rejected::text || ' success(es) across 3 calls; row used=' || v_left::text,
       case when v_rejected = 1 and v_left = 1 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-11', 'repeated consumption attempts yield exactly ONE success (single-statement, row-locked)',
         '3 calls, 1 success, row used exactly once',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-12 · the same digest can never be created twice ──────────────────
  begin
    v_attempt := public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_main, v_target);
    insert into cb003_adversarial_results values
      ('CB3-12', 'a second attempt with an existing digest is refused (replay prevention, layer 1)',
       '23505 — one digest, one row, ever',
       'ACCEPTED — DEFECT', 'FAIL');
  exception
    when unique_violation then
      insert into cb003_adversarial_results values
        ('CB3-12', 'a second attempt with an existing digest is refused (replay prevention, layer 1)',
         '23505 — one digest, one row, ever',
         '23505 — rejected', 'PASS');
    when others then
      insert into cb003_adversarial_results values
        ('CB3-12', 'a second attempt with an existing digest is refused (replay prevention, layer 1)',
         '23505 — one digest, one row, ever',
         'rejected with unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RETURN TARGET — the open-redirect boundary
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB3-13 · absolute external and protocol-relative targets rejected ────
  v_rejected := 0;
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_target_a, 'https://evil.example/cb');
  exception when others then v_rejected := v_rejected + 1;
  end;
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_target_b, '//evil.example/cb');
  exception when others then v_rejected := v_rejected + 1;
  end;
  insert into cb003_adversarial_results values
    ('CB3-13', 'an absolute external URL and a protocol-relative target are rejected',
     '2 of 2 rejected', v_rejected::text || ' of 2 rejected',
     case when v_rejected = 2 then 'PASS' else 'FAIL' end);

  -- ── CB3-14 · javascript: and data: scheme targets rejected ───────────────
  v_rejected := 0;
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_target_c, 'javascript:alert(1)');
  exception when others then v_rejected := v_rejected + 1;
  end;
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_target_d, 'data:text/html,<script>x</script>');
  exception when others then v_rejected := v_rejected + 1;
  end;
  insert into cb003_adversarial_results values
    ('CB3-14', 'javascript: and data: style return targets are rejected',
     '2 of 2 rejected', v_rejected::text || ' of 2 rejected',
     case when v_rejected = 2 then 'PASS' else 'FAIL' end);

  -- ── CB3-15 · traversal, percent-encoding and backslash rejected ─────────
  -- Percent-encoding is refused outright, so a double-encoded '//' cannot walk
  -- past the protocol-relative rule either.
  v_rejected := 0;
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_target_e, '/a/../../etc/passwd');
  exception when others then v_rejected := v_rejected + 1;
  end;
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_target_f, '/a%2F%2Fevil.example');
  exception when others then v_rejected := v_rejected + 1;
  end;
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_target_g, E'/a\\b');
  exception when others then v_rejected := v_rejected + 1;
  end;
  insert into cb003_adversarial_results values
    ('CB3-15', 'traversal, percent-encoded and backslash return targets are rejected',
     '3 of 3 rejected', v_rejected::text || ' of 3 rejected',
     case when v_rejected = 3 then 'PASS' else 'FAIL' end);

  -- ══════════════════════════════════════════════════════════════════════════
  -- VOCABULARY AND DIGEST SHAPE
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB3-16 · a provider outside the vocabulary is rejected ───────────────
  begin
    perform public.provider_authorization_attempt_create(
      'paypal', v_category, biz_a, actor_a, v_h_provider, v_target);
    insert into cb003_adversarial_results values
      ('CB3-16', 'a provider outside the certified vocabulary is rejected', 'rejected',
       'ACCEPTED — DEFECT', 'FAIL');
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-16', 'a provider outside the certified vocabulary is rejected', 'rejected',
         'rejected with sqlstate ' || sqlstate, 'PASS');
  end;

  -- ── CB3-17 · a connection category outside the vocabulary is rejected ────
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, 'crypto', biz_a, actor_a, v_h_category, v_target);
    insert into cb003_adversarial_results values
      ('CB3-17', 'a connection category outside the certified vocabulary is rejected', 'rejected',
       'ACCEPTED — DEFECT', 'FAIL');
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-17', 'a connection category outside the certified vocabulary is rejected', 'rejected',
         'rejected with sqlstate ' || sqlstate, 'PASS');
  end;

  -- ── CB3-18 · a malformed digest is rejected on BOTH counts ───────────────
  -- Too short, and right length but not hex. A digest that is merely "text" must
  -- never be storable.
  v_rejected := 0;
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_bad1, v_target);
  exception when others then v_rejected := v_rejected + 1;
  end;
  begin
    perform public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_bad2, v_target);
  exception when others then v_rejected := v_rejected + 1;
  end;
  insert into cb003_adversarial_results values
    ('CB3-18', 'a malformed digest is rejected (63 characters, and 64 non-hex characters)',
     '2 of 2 rejected', v_rejected::text || ' of 2 rejected',
     case when v_rejected = 2 then 'PASS' else 'FAIL' end);

  -- ══════════════════════════════════════════════════════════════════════════
  -- SAME-BUSINESS INTEGRITY ON result_connection_id
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB3-19 · the POSITIVE control: a same-business attach is accepted ────
  -- Without this row, CB3-21 could be satisfied by a constraint that rejects
  -- everything. A same-business attach must SUCCEED.
  begin
    insert into public.business_connections
      (id, business_id, provider, connection_category, provider_organization_id, status)
    values
      (v_conn_same, biz_a, v_provider, v_category, 'item_cb003_same', 'active');

    v_attempt := public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, v_h_same, v_target);
    perform public.provider_authorization_attempt_consume(v_provider, v_h_same);

    update public.provider_authorization_attempts
       set result_connection_id = v_conn_same
     where id = v_attempt;

    select count(*) into v_left
    from public.provider_authorization_attempts
    where id = v_attempt and result_connection_id = v_conn_same and status = 'used';

    insert into cb003_adversarial_results values
      ('CB3-19', 'a same-business result connection attaches only after consumption (positive control)',
       'attach accepted; status used; reference set',
       'attach accepted; matching row(s)=' || v_left::text,
       case when v_left = 1 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-19', 'a same-business result connection attaches only after consumption (positive control)',
         'attach accepted; status used; reference set',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-20 · the constraint itself, from the catalog (UNCONDITIONAL) ─────
  -- Proves the mechanism exists with its exact ordered mapping AND its cascade,
  -- that it is the ONLY constraint with that identity, and that the name the
  -- catalog holds is the certified name in the form PostgreSQL actually stores.
  -- The name comparison is EXPLICIT — conname::text against a text value — because
  -- a name-typed comparison silently truncates the literal too and would hide a
  -- disagreement of exactly the kind that made CB3-21 report a stale expectation.
  -- This is the form of the proof that does not depend on a second business.
  begin
    select count(*) into v_count
    from pg_constraint c
    where c.contype = 'f'
      and c.conname::text = v_fk_expected
      and c.conrelid = 'public.provider_authorization_attempts'::regclass
      and c.confrelid = 'public.business_connections'::regclass
      and c.confdeltype = 'c'
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.conkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
          = array['result_connection_id', 'business_id']
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.confkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
          = array['id', 'business_id'];

    -- The SAME identity with the name held out. This is what proves there is
    -- EXACTLY ONE same-business FK, so a duplicate cannot hide behind the single
    -- name match above.
    select count(*) into v_fk_count
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.provider_authorization_attempts'::regclass
      and c.confrelid = 'public.business_connections'::regclass
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.conkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
          = array['result_connection_id', 'business_id']
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.confkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
          = array['id', 'business_id'];

    insert into cb003_adversarial_results values
      ('CB3-20', 'the same-business composite FK exists with its exact ordered column mapping',
       '1 constraint, (result_connection_id, business_id) → business_connections(id, business_id) ON DELETE CASCADE, stored name ' || v_fk_expected,
       v_count::text || ' matching constraint(s); constraints with this identity=' || v_fk_count::text
         || '; catalog name=' || coalesce(v_fk_name, '<none>'),
       case when v_count = 1 and v_fk_count = 1 and v_fk_name = v_fk_expected
            then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-20', 'the same-business composite FK exists with its exact ordered column mapping',
         '1 constraint, (result_connection_id, business_id) → business_connections(id, business_id) ON DELETE CASCADE, stored name ' || v_fk_expected,
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-21 · BEHAVIOURAL cross-business attach rejected ──────────────────
  -- The verdict requires SQLSTATE 23503 AND that the constraint which FIRED is the
  -- certified same-business composite FK. That identity is taken from the CATALOG —
  -- the single constraint CB3-20 has just proved, by its exact mapping — and never
  -- from a hardcoded suffix. It is compared as TEXT because GET STACKED
  -- DIAGNOSTICS returns the STORED name, i.e. the 63-byte form PostgreSQL holds.
  if biz_b is null then
    insert into cb003_adversarial_results values
      ('CB3-21', 'a cross-business result connection is refused by the database',
       '23503, raised by the certified same-business composite FK (stored name ' || v_fk_expected || ')',
       'SKIPPED — a second business does not exist; CB3-20 proves the constraint from the catalog',
       'SKIPPED');
  else
    begin
      insert into public.business_connections
        (id, business_id, provider, connection_category, provider_organization_id, status)
      values
        (v_conn_other, biz_b, v_provider, v_category, 'item_cb003_other', 'active');

      v_attempt := public.provider_authorization_attempt_create(
        v_provider, v_category, biz_a, actor_a, v_h_cross, v_target);
      perform public.provider_authorization_attempt_consume(v_provider, v_h_cross);

      update public.provider_authorization_attempts
         set result_connection_id = v_conn_other
       where id = v_attempt;

      insert into cb003_adversarial_results values
        ('CB3-21', 'a cross-business result connection is refused by the database',
         '23503, raised by the certified same-business composite FK (stored name ' || v_fk_expected || ')',
         'ACCEPTED — DEFECT', 'FAIL');
    exception
      when foreign_key_violation then
        get stacked diagnostics v_constraint = constraint_name;
        insert into cb003_adversarial_results values
          ('CB3-21', 'a cross-business result connection is refused by the database',
           '23503, raised by the certified same-business composite FK (stored name ' || v_fk_expected || ')',
           '23503 / ' || coalesce(v_constraint, '<none>')
             || '; catalog identity: ' || coalesce(v_fk_name, '<none>'),
           case when v_constraint = v_fk_name then 'PASS' else 'FAIL' end);
      when others then
        insert into cb003_adversarial_results values
          ('CB3-21', 'a cross-business result connection is refused by the database',
           '23503, raised by the certified same-business composite FK (stored name ' || v_fk_expected || ')',
           'unexpected sqlstate ' || sqlstate, 'FAIL');
    end;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- AUTHORIZATION — the four functions are service_role-only
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB3-22 · no browser role holds EXECUTE on ANY function (catalog) ─────
  -- The unconditional form of CB3-23/CB3-24, and it also covers PUBLIC, which has
  -- no role to assume. A NULL proacl means the DEFAULT applies — which INCLUDES
  -- PUBLIC EXECUTE — so NULL is counted as a defect, never as clean.
  begin
    select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('provider_authorization_attempt_create', 'provider_authorization_attempt_consume',
                        'provider_authorization_attempt_cancel', 'provider_authorization_attempt_fail')
      and (
        p.proacl is null
        or exists (select 1 from aclexplode(p.proacl) a
                    where a.grantee = 0 and a.privilege_type = 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      );

    insert into cb003_adversarial_results values
      ('CB3-22', 'no CB-003 function is reachable by PUBLIC, anon or authenticated', '0 reachable functions',
       v_count::text || ' reachable function(s)',
       case when v_count = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-22', 'no CB-003 function is reachable by PUBLIC, anon or authenticated', '0 reachable functions',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-23 · anon cannot invoke the creation boundary ───────────────────
  begin
    set local role anon;
    begin
      perform public.provider_authorization_attempt_create(
        v_provider, v_category, biz_a, actor_a, repeat('e1', 32), v_target);
      insert into cb003_adversarial_results values
        ('CB3-23', 'anon cannot invoke provider_authorization_attempt_create', 'insufficient_privilege',
         'INVOKED — DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb003_adversarial_results values
          ('CB3-23', 'anon cannot invoke provider_authorization_attempt_create', 'insufficient_privilege',
           'insufficient_privilege raised', 'PASS');
    end;
    reset role;
  exception
    when others then
      reset role;
      insert into cb003_adversarial_results values
        ('CB3-23', 'anon cannot invoke provider_authorization_attempt_create', 'insufficient_privilege',
         'could not assume role anon: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ── CB3-24 · authenticated cannot invoke the consumption boundary ────────
  begin
    set local role authenticated;
    begin
      perform * from public.provider_authorization_attempt_consume(v_provider, v_h_main);
      insert into cb003_adversarial_results values
        ('CB3-24', 'authenticated cannot invoke provider_authorization_attempt_consume', 'insufficient_privilege',
         'INVOKED — DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb003_adversarial_results values
          ('CB3-24', 'authenticated cannot invoke provider_authorization_attempt_consume', 'insufficient_privilege',
           'insufficient_privilege raised', 'PASS');
    end;
    reset role;
  exception
    when others then
      reset role;
      insert into cb003_adversarial_results values
        ('CB3-24', 'authenticated cannot invoke provider_authorization_attempt_consume', 'insufficient_privilege',
         'could not assume role authenticated: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ── CB3-25 · service_role positive capability (create + consume) ─────────
  -- The complement of CB3-23/CB3-24. A lockdown that cannot be used is a lockout.
  begin
    set local role service_role;
    v_attempt := public.provider_authorization_attempt_create(
      v_provider, v_category, biz_a, actor_a, repeat('e2', 32), v_target);

    select count(*) into v_n
    from public.provider_authorization_attempt_consume(v_provider, repeat('e2', 32)) r;
    reset role;

    insert into cb003_adversarial_results values
      ('CB3-25', 'service_role CAN invoke the boundary (create, then consume)', 'created and consumed',
       'created=' || case when v_attempt is null then 'no' else 'yes' end
         || ', consumed rows=' || v_n::text,
       case when v_attempt is not null and v_n = 1 then 'PASS' else 'FAIL' end);
  exception
    when others then
      reset role;
      insert into cb003_adversarial_results values
        ('CB3-25', 'service_role CAN invoke the boundary (create, then consume)', 'created and consumed',
         'rejected: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- NO SECRET MATERIAL, AND THE FACT FREEZE
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB3-26 · nothing credential-shaped is storable in or near an attempt ─
  -- Every column of every synthetic attempt is checked for a credential shape,
  -- and the table is checked for a credential-shaped column name.
  begin
    select count(*) into v_count
    from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_authorization_attempts'
      and column_name in ('access_token', 'refresh_token', 'public_token', 'link_token',
                          'authorization_code', 'client_secret', 'client_secret_value', 'password',
                          'credential_value', 'plaintext_secret', 'decrypted_secret',
                          'token_value', 'secret_value', 'token', 'secret');

    select count(*) into v_left
    from public.provider_authorization_attempts a
    where a.state_hash ~ '^([0-9a-f]{2})\1{31}$'
      and (row_to_json(a)::text like '%access-sandbox%'
           or row_to_json(a)::text like '%refresh_token%'
           or row_to_json(a)::text like '%client_secret%'
           or row_to_json(a)::text like '%' || v_raw_a || '%'
           or row_to_json(a)::text like '%' || v_raw_b || '%');

    insert into cb003_adversarial_results values
      ('CB3-26', 'no credential-shaped column exists and no secret material persists in any attempt row',
       '0 credential-shaped columns; 0 rows carrying secret material',
       v_count::text || ' credential-shaped column(s); ' || v_left::text || ' row(s) carrying material',
       case when v_count = 0 and v_left = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-26', 'no credential-shaped column exists and no secret material persists in any attempt row',
         '0 credential-shaped columns; 0 rows carrying secret material',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-27 · the Digital Twin fact freeze is untouched ───────────────────
  begin
    select
      (case when to_regclass('public.business_facts') is null then -1
            else (select count(*) from public.business_facts) end)
      + (case when to_regclass('public.business_fact_evidence') is null then -1
              else (select count(*) from public.business_fact_evidence) end)
      into v_count;

    insert into cb003_adversarial_results values
      ('CB3-27', 'the Digital Twin fact freeze remains 0 / 0 / 0 through the whole suite',
       'business_facts=0, business_fact_evidence=0, business_fact_conflicts=0 or absent',
       'business_facts=' || (case when to_regclass('public.business_facts') is null then -1
                                  else (select count(*) from public.business_facts) end)::text
         || ', business_fact_evidence=' || (case when to_regclass('public.business_fact_evidence') is null then -1
                                                 else (select count(*) from public.business_fact_evidence) end)::text
         || ', business_fact_conflicts=' || (case when to_regclass('public.business_fact_conflicts') is null then 'absent'
                                                  else (select count(*)::text from public.business_fact_conflicts) end),
       case when (case when to_regclass('public.business_facts') is null then 0
                       else (select count(*) from public.business_facts) end) = 0
             and (case when to_regclass('public.business_fact_evidence') is null then 0
                       else (select count(*) from public.business_fact_evidence) end) = 0
             and (case when to_regclass('public.business_fact_conflicts') is null then '0'
                       else (select count(*)::text from public.business_fact_conflicts) end) = '0'
            then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-27', 'the Digital Twin fact freeze remains 0 / 0 / 0 through the whole suite',
         'business_facts=0, business_fact_evidence=0, business_fact_conflicts=0 or absent',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB3-28 · the raw-state and stored-digest REPRESENTATIONS are disjoint ─
  -- The behavioural counterpart of the migration's frozen encoding contract. It
  -- proves the DISTINCTION between the two representations rather than merely
  -- observing that some short string was refused: the canonical raw state is 43
  -- unpadded base64url characters, the canonical digest is 64 lowercase hex
  -- characters, and no raw state can be the same value as a stored digest.
  begin
    insert into cb003_adversarial_results values
      ('CB3-28', 'the canonical raw-state representation and the stored digest representation are disjoint',
       'raw = 43 unpadded base64url characters; digest = 64 lowercase hex characters; the raw state does not satisfy the digest constraint',
       'raw length=' || length(v_raw_a)::text
         || ', raw is 43-char base64url=' || (v_raw_a ~ '^[A-Za-z0-9_-]{43}$')::text
         || ', raw carries padding=' || (position('=' in v_raw_a) > 0)::text
         || ', raw satisfies digest shape=' || (v_raw_a ~ '^[0-9a-f]{64}$')::text
         || ', digest length=' || length(v_h_main)::text,
       case when length(v_raw_a) = 43
             and v_raw_a ~ '^[A-Za-z0-9_-]{43}$'
             and position('=' in v_raw_a) = 0
             and v_raw_a !~ '^[0-9a-f]{64}$'
             and length(v_h_main) = 64
             and v_h_main ~ '^[0-9a-f]{64}$'
            then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb003_adversarial_results values
        ('CB3-28', 'the canonical raw-state representation and the stored digest representation are disjoint',
         'raw = 43 unpadded base64url characters; digest = 64 lowercase hex characters; the raw state does not satisfy the digest constraint',
         'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- CLEANUP
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB3-C1 · no synthetic material survives ─────────────────────────────
  insert into cb003_adversarial_results values
    ('CB3-C1', 'no synthetic attempt or synthetic connection survives the suite',
     '0 / 0 after ROLLBACK',
     'every synthetic row is confined to this uncommitted transaction; CB3-C1 is '
     || 'verdict-ed by the READ-ONLY companion residue check, run next',
     'MANUAL');
end $$;

-- ── REPORT (read this grid before the rollback) ─────────────────────────────
select test_id, requirement, expected, observed, verdict
from cb003_adversarial_results
order by test_id;

rollback;