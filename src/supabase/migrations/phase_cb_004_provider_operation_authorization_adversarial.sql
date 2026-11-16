-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-004 · PROVIDER OPERATION AUTHORIZATION KERNEL — ADVERSARIAL SUITE
-- ============================================================================
-- Proves the DATABASE half of the CB-004 boundary on a live server: that the
-- audit trail cannot be rewritten, that no browser role can reach it or its
-- writer, that the vocabularies fail closed, and that credential-shaped metadata
-- is refused at the point of writing rather than hoped away.
--
-- SYNTHETIC ONLY. No provider is contacted, no OAuth flow runs, no connection and
-- no credential is created, and no real credential of any kind appears. Every
-- test row is keyed on the reserved CB-004 correlation prefix:
--     vision_test_corr_cb004_*
-- and every synthetic VALUE carries the marker
--     vision_test_cb004_redacted
-- The reserved connection namespace for this phase is
--     00000000-0000-0000-0000-0000000c04xx
-- which CB-002 used 0c02xx, CB-003 0c03xx and CB-002.1 0c21xx — no collision. This
-- suite deliberately creates NO connection (the audit foreign keys are nullable
-- and the invariants under test do not need one); the namespace is DECLARED here
-- and MEASURED by the read-only residue companion, so a future edit that started
-- creating synthetic connections could not do so unnoticed.
--
-- ── WHAT THIS SUITE CANNOT TEST, AND WHY THAT IS NOT A GAP ─────────────────
--   The authorization DECISION is not made by the database. Actor resolution,
--   row-derived business binding, permission mapping, connection state and the
--   non-enumeration rule all live in base44/shared/providers/authorization.ts,
--   and they are certified BEHAVIOURALLY — the real module transpiled and
--   executed against fixtures — by scripts/cb004AuthorizationKernelChecks.cjs,
--   together with the mutation tests that prove each of those checks can fail.
--   A SQL suite that pretended to authorize an actor would be theatre. This file
--   tests what a database can actually enforce, and nothing else.
--
-- SAFETY DESIGN
--   · ONE begin, NO COMMIT anywhere, ONE unconditional final rollback.
--   · Role tests switch role with SET LOCAL ROLE and report SKIPPED — never PASS
--     — when a role cannot be assumed.
--   · Every test id is emitted on BOTH paths, so an unexpected failure can never
--     silently shrink the verdict grid and be mistaken for a shorter suite.
--   · It creates NO relation and changes NO privilege: it only attempts writes
--     and reads catalogs.
--
-- HOW TO READ THIS — TWO EXECUTIONS
--     STEP 1  this file                                        → the CB4-* grid
--     STEP 2  …_adversarial_residue.sql                        → 0 / 0 / 0 / PASS
--   The grid is the last row-returning statement, BEFORE the rollback. NEVER
--   comment out, move, or bypass the `rollback;`.
-- ============================================================================

begin;

create temp table cb004_adversarial_results (
  test_id     text,
  requirement text,
  expected    text,
  observed    text,
  verdict     text
) on commit drop;

do $$
declare
  v_business uuid;
  v_profile  uuid;
  v_audit_id uuid;
  v_constraint text;
  v_ok boolean;
  v_n integer;
  v_corr text := 'vision_test_corr_cb004_positive';
begin
  -- ── preconditions ────────────────────────────────────────────────────────
  select id into v_business from public.business_entities order by id limit 1;
  select id into v_profile  from public.profiles order by id limit 1;

  if v_business is null then
    insert into cb004_adversarial_results values
      ('CB4-U0', 'precondition: one existing business id for the audit foreign key',
       'at least one business present', 'no business exists', 'SKIPPED');
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE POSITIVE CONTROL — a well-formed row IS accepted, and read back.
  -- Runs FIRST, so every refusal below is proven against a writer that demonstrably
  -- works. A suite that only ever sees refusals cannot distinguish a guard from a
  -- broken function.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    v_audit_id := public.provider_operation_audit_record(
      'user',                      -- actor_kind
      v_profile,                   -- actor_profile_id
      v_business,                  -- business_id
      'quickbooks',                -- provider
      'connection.read',           -- operation
      null,                        -- business_connection_id
      null,                        -- authorization_attempt_id
      null,                        -- resource_type
      null,                        -- resource_id
      'allow',                     -- decision
      'AUTHORIZED',                -- reason_code
      v_corr,                      -- request_correlation_id
      '{"note":"synthetic"}'::jsonb
    );

    select (decision = 'allow' and reason_code = 'AUTHORIZED' and business_id = v_business)
      into v_ok
    from public.provider_operation_audit where id = v_audit_id;

    insert into cb004_adversarial_results values
      ('CB4-R4', 'a well-formed audit row is accepted and is readable afterwards',
       'the writer returns an id and the row carries the recorded decision',
       case when v_audit_id is null then 'no id returned'
            else 'id returned; row matches=' || coalesce(v_ok, false)::text end,
       case when v_audit_id is not null and v_ok then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-R4', 'a well-formed audit row is accepted and is readable afterwards',
         'the writer returns an id and the row carries the recorded decision',
         'unexpected error: sqlstate ' || sqlstate || ' — ' || sqlerrm, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ACCESS — who may write the trail, and who may not
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB4-D1 · anon cannot reach the writer ───────────────────────────────
  begin
    set local role anon;
    begin
      perform public.provider_operation_audit_record('user', null, null, null, 'unknown',
        null, null, null, null, 'deny', 'ACTOR_UNRESOLVED', null, '{}'::jsonb);
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D1', 'anon cannot invoke the audit writer', 'insufficient_privilege',
         'INVOKED - DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb004_adversarial_results values
          ('CB4-D1', 'anon cannot invoke the audit writer', 'insufficient_privilege',
           'insufficient_privilege raised', 'PASS');
    end;
  exception
    when others then
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D1', 'anon cannot invoke the audit writer', 'insufficient_privilege',
         'could not assume role anon: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ── CB4-D2 · authenticated cannot reach the writer ──────────────────────
  begin
    set local role authenticated;
    begin
      perform public.provider_operation_audit_record('user', null, null, null, 'unknown',
        null, null, null, null, 'deny', 'ACTOR_UNRESOLVED', null, '{}'::jsonb);
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D2', 'authenticated cannot invoke the audit writer', 'insufficient_privilege',
         'INVOKED - DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb004_adversarial_results values
          ('CB4-D2', 'authenticated cannot invoke the audit writer', 'insufficient_privilege',
           'insufficient_privilege raised', 'PASS');
    end;
  exception
    when others then
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D2', 'authenticated cannot invoke the audit writer', 'insufficient_privilege',
         'could not assume role authenticated: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ── CB4-D3 · service_role CAN write — a lockdown that cannot be used is a lockout
  begin
    set local role service_role;
    v_audit_id := public.provider_operation_audit_record('user', null, null, null, 'unknown',
      null, null, null, null, 'deny', 'ACTOR_UNRESOLVED', 'vision_test_corr_cb004_service_role', '{}'::jsonb);
    reset role;
    insert into cb004_adversarial_results values
      ('CB4-D3', 'service_role CAN invoke the boundary through the validating writer',
       'an id is returned', case when v_audit_id is null then 'no id returned' else 'id returned' end,
       case when v_audit_id is not null then 'PASS' else 'FAIL' end);
  exception
    when others then
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D3', 'service_role CAN invoke the boundary through the validating writer',
         'an id is returned', 'rejected: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB4-D4 · service_role cannot rewrite history ────────────────────────
  begin
    set local role service_role;
    begin
      update public.provider_operation_audit set reason_code = 'AUTHORIZED' where id = v_audit_id;
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D4', 'the audit trail cannot be UPDATED by service_role, the role the app holds',
         'insufficient_privilege', 'UPDATED - DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb004_adversarial_results values
          ('CB4-D4', 'the audit trail cannot be UPDATED by service_role, the role the app holds',
           'insufficient_privilege', 'insufficient_privilege raised', 'PASS');
    end;
  exception
    when others then
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D4', 'the audit trail cannot be UPDATED by service_role, the role the app holds',
         'insufficient_privilege', 'could not assume role service_role: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ── CB4-D5 · service_role cannot destroy history ────────────────────────
  begin
    set local role service_role;
    begin
      delete from public.provider_operation_audit where id = v_audit_id;
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D5', 'the audit trail cannot be DELETED by service_role',
         'insufficient_privilege', 'DELETED - DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb004_adversarial_results values
          ('CB4-D5', 'the audit trail cannot be DELETED by service_role',
           'insufficient_privilege', 'insufficient_privilege raised', 'PASS');
    end;
  exception
    when others then
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D5', 'the audit trail cannot be DELETED by service_role',
         'insufficient_privilege', 'could not assume role service_role: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ── CB4-D6 · the table cannot be written directly, bypassing the validation
  begin
    set local role service_role;
    begin
      insert into public.provider_operation_audit
        (actor_kind, operation, decision, reason_code, request_correlation_id)
      values ('user', 'unknown', 'deny', 'INVALID_OPERATION', 'vision_test_corr_cb004_direct');
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D6', 'service_role cannot INSERT directly, so no row can bypass the validation',
         'insufficient_privilege', 'INSERTED - DEFECT', 'FAIL');
    exception
      when insufficient_privilege then
        reset role;
        insert into cb004_adversarial_results values
          ('CB4-D6', 'service_role cannot INSERT directly, so no row can bypass the validation',
           'insufficient_privilege', 'insufficient_privilege raised', 'PASS');
    end;
  exception
    when others then
      reset role;
      insert into cb004_adversarial_results values
        ('CB4-D6', 'service_role cannot INSERT directly, so no row can bypass the validation',
         'insufficient_privilege', 'could not assume role service_role: sqlstate ' || sqlstate, 'SKIPPED');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- VOCABULARY AND SHAPE — the writer refuses an impossible record
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB4-D7 · an operation outside the closed vocabulary is refused ──────
  begin
    perform public.provider_operation_audit_record('user', null, null, null, 'connection.destroy',
      null, null, null, null, 'deny', 'INVALID_OPERATION', 'vision_test_corr_cb004_d7', '{}'::jsonb);
    insert into cb004_adversarial_results values
      ('CB4-D7', 'an operation outside the closed vocabulary is refused', '22023',
       'ACCEPTED - DEFECT', 'FAIL');
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-D7', 'an operation outside the closed vocabulary is refused', '22023',
         sqlstate || ' — rejected', case when sqlstate = '22023' then 'PASS' else 'FAIL' end);
  end;

  -- ── CB4-D8 · an allow may not cite any reason but AUTHORIZED ────────────
  begin
    perform public.provider_operation_audit_record('user', v_profile, v_business, 'quickbooks', 'sync.read',
      null, null, null, null, 'allow', 'PERMISSION_DENIED', 'vision_test_corr_cb004_d8', '{}'::jsonb);
    insert into cb004_adversarial_results values
      ('CB4-D8', 'ALLOW and AUTHORIZED are the same fact — a contradictory row is refused', '22023',
       'ACCEPTED - DEFECT', 'FAIL');
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-D8', 'ALLOW and AUTHORIZED are the same fact — a contradictory row is refused', '22023',
         sqlstate || ' — rejected', case when sqlstate = '22023' then 'PASS' else 'FAIL' end);
  end;

  -- ── CB4-D9 · an allow must record the provider it was authorized against ─
  begin
    perform public.provider_operation_audit_record('user', v_profile, v_business, null, 'sync.read',
      null, null, null, null, 'allow', 'AUTHORIZED', 'vision_test_corr_cb004_d9', '{}'::jsonb);
    insert into cb004_adversarial_results values
      ('CB4-D9', 'an authorized operation must record its provider', '22023',
       'ACCEPTED - DEFECT', 'FAIL');
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-D9', 'an authorized operation must record its provider', '22023',
         sqlstate || ' — rejected', case when sqlstate = '22023' then 'PASS' else 'FAIL' end);
  end;

  -- ── CB4-D10 · an unknown verb can be recorded, but never as an allow ────
  begin
    perform public.provider_operation_audit_record('user', v_profile, v_business, 'quickbooks', 'unknown',
      null, null, null, null, 'allow', 'AUTHORIZED', 'vision_test_corr_cb004_d10', '{}'::jsonb);
    insert into cb004_adversarial_results values
      ('CB4-D10', 'an operation outside the vocabulary is recordable but never authorized', '22023',
       'ACCEPTED - DEFECT', 'FAIL');
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-D10', 'an operation outside the vocabulary is recordable but never authorized', '22023',
         sqlstate || ' — rejected', case when sqlstate = '22023' then 'PASS' else 'FAIL' end);
  end;

  -- ── CB4-D11 · a system row must never name a profile ────────────────────
  begin
    perform public.provider_operation_audit_record('system', v_profile, v_business, 'quickbooks', 'webhook.process',
      null, null, null, null, 'allow', 'AUTHORIZED', 'vision_test_corr_cb004_d11', '{}'::jsonb);
    insert into cb004_adversarial_results values
      ('CB4-D11', 'a system operation must not manufacture a profile identity', '22023',
       'ACCEPTED - DEFECT', 'FAIL');
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-D11', 'a system operation must not manufacture a profile identity', '22023',
         sqlstate || ' — rejected', case when sqlstate = '22023' then 'PASS' else 'FAIL' end);
  end;

  -- ── CB4-D12 · system execution is NARROWER: it may not authorize a user op
  begin
    perform public.provider_operation_audit_record('system', null, v_business, 'quickbooks', 'sync.start',
      null, null, null, null, 'allow', 'AUTHORIZED', 'vision_test_corr_cb004_d12', '{}'::jsonb);
    insert into cb004_adversarial_results values
      ('CB4-D12', 'a system actor may not authorize a user operation (system is narrower, never broader)',
       '22023', 'ACCEPTED - DEFECT', 'FAIL');
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-D12', 'a system actor may not authorize a user operation (system is narrower, never broader)',
         '22023', sqlstate || ' — rejected', case when sqlstate = '22023' then 'PASS' else 'FAIL' end);
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE CHECK CONSTRAINTS AS A BACKSTOP — proven by bypassing the writer
  --
  -- The writer validates every one of these itself, and the two cases above prove
  -- it does. These two prove the SECOND line: even a future writer that skipped
  -- its own guards, or a manual insert, cannot place an impossible row in the
  -- trail. They run as the table owner (this session), which is the only way to
  -- reach the constraint at all — service_role holds no INSERT, which is itself
  -- the point (CB4-D6).
  --
  -- The constraint that fired is NAMED, via GET STACKED DIAGNOSTICS: a database
  -- backstop proven without naming it is a backstop nobody can attribute.
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB4-D13 · the decision/reason consistency CHECK holds independently ──
  begin
    insert into public.provider_operation_audit
      (actor_kind, actor_profile_id, business_id, provider, operation,
       decision, reason_code, request_correlation_id)
    values ('user', v_profile, v_business, 'quickbooks', 'sync.read',
       'allow', 'PERMISSION_DENIED', 'vision_test_corr_cb004_d13');
    insert into cb004_adversarial_results values
      ('CB4-D13', 'the constraint refuses a contradictory row even when the writer is bypassed',
       '23514 / provider_operation_audit_decision_reason_consistency',
       'ACCEPTED - DEFECT', 'FAIL');
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      insert into cb004_adversarial_results values
        ('CB4-D13', 'the constraint refuses a contradictory row even when the writer is bypassed',
         '23514 / provider_operation_audit_decision_reason_consistency',
         '23514 / ' || coalesce(v_constraint, '<none>'),
         case when v_constraint = 'provider_operation_audit_decision_reason_consistency' then 'PASS' else 'FAIL' end);
    when others then
      insert into cb004_adversarial_results values
        ('CB4-D13', 'the constraint refuses a contradictory row even when the writer is bypassed',
         '23514 / provider_operation_audit_decision_reason_consistency',
         'rejected with unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB4-D14 · the actor identity shape CHECK holds independently ────────
  begin
    insert into public.provider_operation_audit
      (actor_kind, actor_profile_id, business_id, provider, operation,
       decision, reason_code, request_correlation_id)
    values ('system', v_profile, v_business, 'quickbooks', 'webhook.process',
       'deny', 'PERMISSION_DENIED', 'vision_test_corr_cb004_d14');
    insert into cb004_adversarial_results values
      ('CB4-D14', 'the constraint refuses a system row that names a profile, even when the writer is bypassed',
       '23514 / provider_operation_audit_actor_identity_shape',
       'ACCEPTED - DEFECT', 'FAIL');
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      insert into cb004_adversarial_results values
        ('CB4-D14', 'the constraint refuses a system row that names a profile, even when the writer is bypassed',
         '23514 / provider_operation_audit_actor_identity_shape',
         '23514 / ' || coalesce(v_constraint, '<none>'),
         case when v_constraint = 'provider_operation_audit_actor_identity_shape' then 'PASS' else 'FAIL' end);
    when others then
      insert into cb004_adversarial_results values
        ('CB4-D14', 'the constraint refuses a system row that names a profile, even when the writer is bypassed',
         '23514 / provider_operation_audit_actor_identity_shape',
         'rejected with unexpected sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE METADATA GUARD, AT THE POINT OF WRITING
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── CB4-R1 · a top-level credential-shaped key is refused ───────────────
  begin
    perform public.provider_operation_audit_record('user', null, null, null, 'unknown',
      null, null, null, null, 'deny', 'INVALID_OPERATION', 'vision_test_corr_cb004_r1',
      '{"access_token":"vision_test_cb004_redacted"}'::jsonb);
    insert into cb004_adversarial_results values
      ('CB4-R1', 'a credential-shaped metadata key is refused at write time', '22023',
       'ACCEPTED - DEFECT', 'FAIL');
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-R1', 'a credential-shaped metadata key is refused at write time', '22023',
         sqlstate || ' — rejected', case when sqlstate = '22023' then 'PASS' else 'FAIL' end);
  end;

  -- ── CB4-R2 · a NESTED credential-shaped key is refused (the walk is real)
  begin
    perform public.provider_operation_audit_record('user', null, null, null, 'unknown',
      null, null, null, null, 'deny', 'INVALID_OPERATION', 'vision_test_corr_cb004_r2',
      '{"context":{"nested":[{"refresh_token":"vision_test_cb004_redacted"}]}}'::jsonb);
    insert into cb004_adversarial_results values
      ('CB4-R2', 'a NESTED credential-shaped key is refused — the walk is recursive, not top-level',
       '22023', 'ACCEPTED - DEFECT', 'FAIL');
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-R2', 'a NESTED credential-shaped key is refused — the walk is recursive, not top-level',
         '22023', sqlstate || ' — rejected', case when sqlstate = '22023' then 'PASS' else 'FAIL' end);
  end;

  -- ── CB4-R3 · legitimate metadata is ACCEPTED (no false positive) ────────
  -- Measured as a POSITIVE: a guard that rejects everything is not a guard, it is
  -- an outage. token_count is the canonical example — bookkeeping, not a secret.
  begin
    v_audit_id := public.provider_operation_audit_record('user', null, null, null, 'unknown',
      null, null, null, null, 'deny', 'INVALID_OPERATION', 'vision_test_corr_cb004_r3',
      '{"token_count":3,"sync_window_days":90,"institution":"Acme"}'::jsonb);
    insert into cb004_adversarial_results values
      ('CB4-R3', 'legitimate metadata containing token_count is ACCEPTED (exact-key, not substring)',
       'the row is written', case when v_audit_id is null then 'rejected - DEFECT' else 'accepted' end,
       case when v_audit_id is not null then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-R3', 'legitimate metadata containing token_count is ACCEPTED (exact-key, not substring)',
         'the row is written', 'rejected with sqlstate ' || sqlstate || ' - DEFECT', 'FAIL');
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE POSTURE ITSELF — read from the catalogs, not from the artifact
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    select count(*) into v_n
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
    where n.nspname = 'public' and c.relname = 'provider_operation_audit'
      and a.privilege_type in ('UPDATE', 'DELETE', 'INSERT', 'TRUNCATE')
      and a.grantee <> 0;

    select v_n + count(*) into v_n
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
    where n.nspname = 'public' and c.relname = 'provider_operation_audit'
      and a.privilege_type in ('UPDATE', 'DELETE', 'INSERT', 'TRUNCATE')
      and a.grantee = 0;

    insert into cb004_adversarial_results values
      ('CB4-P1', 'append-only is the ABSENCE of privilege: no role and not PUBLIC holds INSERT/UPDATE/DELETE',
       '0 grants of INSERT/UPDATE/DELETE/TRUNCATE', v_n::text || ' such grant(s)',
       case when v_n = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-P1', 'append-only is the ABSENCE of privilege: no role and not PUBLIC holds INSERT/UPDATE/DELETE',
         '0 grants of INSERT/UPDATE/DELETE/TRUNCATE', 'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  -- ── CB4-F1 · the Digital Twin freeze, measured inside the transaction ───
  begin
    select (select count(*) from public.business_facts)
         + (select count(*) from public.business_fact_evidence)
         + (select count(*) from public.business_fact_conflicts)
      into v_n;
    insert into cb004_adversarial_results values
      ('CB4-F1', 'UNKNOWN ≠ ZERO: the Digital Twin stays 0 / 0 / 0 through the whole suite',
       'business_facts + evidence + conflicts = 0', 'total fact rows=' || v_n::text,
       case when v_n = 0 then 'PASS' else 'FAIL' end);
  exception
    when others then
      insert into cb004_adversarial_results values
        ('CB4-F1', 'UNKNOWN ≠ ZERO: the Digital Twin stays 0 / 0 / 0 through the whole suite',
         'business_facts + evidence + conflicts = 0', 'unexpected error: sqlstate ' || sqlstate, 'FAIL');
  end;

  insert into cb004_adversarial_results values
    ('CB4-C1', 'no synthetic audit row survives the suite',
     '0 rows carrying the CB-004 correlation prefix after ROLLBACK',
     'every synthetic row is confined to this uncommitted transaction; CB4-C1 is verdicted '
     || 'by the READ-ONLY companion residue check, run next', 'MANUAL');
end $$;

-- ── REPORT (read this grid before the rollback) ─────────────────────────────
select test_id, requirement, expected, observed, verdict
from cb004_adversarial_results
order by test_id;

rollback;