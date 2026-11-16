-- ════════════════════════════════════════════════════════════════════════════
-- VISION — CONNECTED BUSINESS
-- PHASE CB-004.2 — SYSTEM JOB EXECUTION AUTHORIZATION
--
-- ONE additive change: the system-only operation 'sync.execute'.
--
--   "Authorize the system worker to execute THIS SPECIFIC already-created,
--    immutable provider sync job."
--
-- It is NOT "authorize generic provider sync": the job resource is the
-- authorization boundary, so the operation confers no provider-read authority of
-- its own. The exact provider operation (accounts.read / balances.read /
-- transactions.read) is bound permanently by the immutable job row and is
-- derived from it by the execution verifier — never named by a caller, and never
-- carried as an authority claim in metadata.
--
-- WHY THREE STATEMENTS ARE NEEDED — they are ONE change, expressed in the three
-- places where the closed vocabulary is independently enforced:
--
--   1. the audit table's operation CHECK  — the recorded domain;
--   2. the writer function's own re-validation of that same closed domain (it
--      refuses an operation outside the vocabulary BEFORE the table CHECK is
--      consulted, so a table-only change would make a legitimate system ALLOW
--      unrecordable and therefore impossible);
--   3. the writer's system-execution narrowing, which must admit the new
--      operation for a system row while remaining the explicit, closed list that
--      keeps system execution NARROWER than user execution.
--
-- The writer is REPLACED, not created: same name, same ordered argument types,
-- same owner, same SECURITY DEFINER hardening, and EVERY existing guard. The
-- certification compares the replacement's guards to the artifact it replaces, so
-- a lost guard is a failing check rather than a silent weakening.
--
-- ACCESS CONTROL: no privilege is widened anywhere. The REVOKE/GRANT statements
-- below only re-assert the certified posture for the replaced function; the
-- replacement preserves the function's identity, so its ACL is unchanged either
-- way, and re-asserting it makes the migration safe to apply on its own.
--
-- SCOPE: no new table, no new function, no new policy, no index, no sequence, no
-- credential, no job, no observation, no checkpoint. No Digital Twin object, no
-- Vault, no provider, no network, no live sync. No row is written by this file.
-- The applied CB-004 migration is NOT edited.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · THE OPERATION DOMAIN — reproduced EXACTLY, then extended by exactly one
--
-- Every value below is the DEPLOYED CB-004 definition verbatim (19 values after
-- the addition), including the separate 'unknown' disjunct. 'unknown' is not an
-- operation: it is the record THAT an out-of-vocabulary operation was attempted,
-- which is why it sits outside the list and can never be authorized.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.provider_operation_audit
  drop constraint if exists provider_operation_audit_operation_check;

alter table public.provider_operation_audit
  add constraint provider_operation_audit_operation_check
  check (
    operation in (
      'connection.create', 'connection.read', 'connection.update', 'connection.disconnect',
      'authorization.begin', 'authorization.complete', 'authorization.cancel',
      'credential.create', 'credential.resolve', 'credential.rotate', 'credential.revoke',
      'accounts.read', 'balances.read', 'transactions.read',
      'sync.start', 'sync.read', 'sync.retry',
      'webhook.process',
      'sync.execute'
    )
    or operation = 'unknown'
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · THE WRITER — the SAME guards, the SAME identity, two extended lists
--
-- Only two things differ from the applied definition, and both are the closed
-- vocabulary: 'sync.execute' is added to the operation domain the writer
-- re-validates (so a system ALLOW can be recorded at all) and to the system
-- narrowing (so the operation is legal for a system row). Every other guard —
-- actor-kind pair, identity shape, decision/reason consistency, allow-has-provider,
-- unknown-never-authorized, the bounded reason vocabulary, and the recursive
-- credential-shaped metadata walk — is reproduced byte for byte.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.provider_operation_audit_record(
  p_actor_kind               text,
  p_actor_profile_id         uuid,
  p_business_id              uuid,
  p_provider                 text,
  p_operation                text,
  p_business_connection_id   uuid,
  p_authorization_attempt_id uuid,
  p_resource_type            text,
  p_resource_id              text,
  p_decision                 text,
  p_reason_code              text,
  p_request_correlation_id   text,
  p_safe_metadata            jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_normalized_key text;
  v_id             uuid;
begin
  -- ── actor kind: the closed pair, and the identity shape it implies ───────
  if p_actor_kind is null or p_actor_kind not in ('user', 'system') then
    raise exception 'provider_operation_audit_record: actor_kind must be user or system'
      using errcode = '22023';
  end if;
  if p_actor_kind = 'system' and p_actor_profile_id is not null then
    raise exception 'provider_operation_audit_record: a system operation must not name a profile'
      using errcode = '22023';
  end if;

  -- ── operation: closed vocabulary, plus the ONE recorded outlier ──────────
  if p_operation is null or (
       p_operation <> 'unknown' and p_operation not in (
         'connection.create', 'connection.read', 'connection.update', 'connection.disconnect',
         'authorization.begin', 'authorization.complete', 'authorization.cancel',
         'credential.create', 'credential.resolve', 'credential.rotate', 'credential.revoke',
         'accounts.read', 'balances.read', 'transactions.read',
         'sync.start', 'sync.read', 'sync.retry',
         'webhook.process',
         'sync.execute'
       )
     ) then
    raise exception 'provider_operation_audit_record: operation is outside the closed vocabulary'
      using errcode = '22023';
  end if;

  -- ── decision and reason: closed, and mutually consistent ────────────────
  if p_decision is null or p_decision not in ('allow', 'deny') then
    raise exception 'provider_operation_audit_record: decision must be allow or deny'
      using errcode = '22023';
  end if;
  if p_reason_code is null or p_reason_code not in (
       'AUTHORIZED', 'ACTOR_UNRESOLVED', 'BUSINESS_ACCESS_DENIED', 'PERMISSION_DENIED',
       'RESOURCE_NOT_FOUND', 'RESOURCE_BUSINESS_MISMATCH', 'CONNECTION_INACTIVE',
       'OPERATION_NOT_ALLOWED', 'INVALID_OPERATION', 'AUTHORIZATION_ATTEMPT_INVALID',
       'CREDENTIAL_UNAVAILABLE', 'PROVIDER_AUTHENTICITY_FAILED', 'SYSTEM_CONTEXT_UNRESOLVED'
     ) then
    raise exception 'provider_operation_audit_record: reason_code is outside the bounded vocabulary'
      using errcode = '22023';
  end if;
  if (p_decision = 'allow') <> (p_reason_code = 'AUTHORIZED') then
    raise exception 'provider_operation_audit_record: allow and AUTHORIZED are the same fact'
      using errcode = '22023';
  end if;

  -- ── an ALLOW always resolved a provider, and is never an unknown verb ────
  if p_decision = 'allow' and p_provider is null then
    raise exception 'provider_operation_audit_record: an authorized operation must record its provider'
      using errcode = '22023';
  end if;
  if p_operation = 'unknown' and p_decision = 'allow' then
    raise exception 'provider_operation_audit_record: an operation outside the vocabulary is never authorized'
      using errcode = '22023';
  end if;

  -- ── system execution is NARROWER, never broader (§17, §18) ───────────────
  -- The three operations that legitimately have no interactive actor are the only
  -- ones a system row may record as authorized: resolving a credential for
  -- provider execution, processing a provider webhook, and executing one specific
  -- already-created job (CB-004.2). The module declares the same three
  -- (SYSTEM_OPERATIONS) and the harness asserts the two agree — so adding an
  -- operation here that the module does not declare turns the certification red.
  if p_actor_kind = 'system'
     and p_decision = 'allow'
     and p_operation not in ('credential.resolve', 'webhook.process', 'sync.execute') then
    raise exception 'provider_operation_audit_record: a system operation may not authorize a user operation'
      using errcode = '22023';
  end if;

  -- ── metadata: an object, bounded, and free of credential-shaped keys ─────
  if p_safe_metadata is null or jsonb_typeof(p_safe_metadata) <> 'object' then
    raise exception 'provider_operation_audit_record: safe_metadata must be a JSON object'
      using errcode = '22023';
  end if;
  if length(p_safe_metadata::text) > 4096 then
    raise exception 'provider_operation_audit_record: safe_metadata exceeds the bounded size'
      using errcode = '22023';
  end if;

  with recursive containers(depth, node) as (
    select 0, p_safe_metadata
    union all
    select c.depth + 1, child.value
    from containers c
    cross join lateral (
      select v.value
      from jsonb_each(case when jsonb_typeof(c.node) = 'object' then c.node else '{}'::jsonb end) as v
      union all
      select a.value
      from jsonb_array_elements(case when jsonb_typeof(c.node) = 'array' then c.node else '[]'::jsonb end) as a
    ) as child
    where c.depth < 6
  )
  select k.key into v_normalized_key
  from containers c
  cross join lateral (
    select key from jsonb_each(case when jsonb_typeof(c.node) = 'object' then c.node else '{}'::jsonb end)
  ) as k
  where regexp_replace(lower(k.key), '[^a-z0-9]', '', 'g') in (
          'accesstoken', 'refreshtoken', 'publictoken', 'linktoken', 'authorizationcode',
          'clientsecret', 'secret', 'password', 'credential', 'privatekey', 'apikey', 'token'
        )
     or regexp_replace(lower(k.key), '[^a-z0-9]', '', 'g') ~
        '(accesstoken|refreshtoken|publictoken|authorizationcode|clientsecret|privatekey)$'
  limit 1;

  if v_normalized_key is not null then
    raise exception 'provider_operation_audit_record: credential-shaped metadata key rejected'
      using errcode = '22023';
  end if;

  -- ── the ONE write. There is no UPDATE and no DELETE in this function. ───
  insert into public.provider_operation_audit (
    actor_kind, actor_profile_id, business_id, provider, operation,
    business_connection_id, authorization_attempt_id,
    resource_type, resource_id, decision, reason_code,
    request_correlation_id, safe_metadata
  )
  values (
    p_actor_kind, p_actor_profile_id, p_business_id, p_provider, p_operation,
    p_business_connection_id, p_authorization_attempt_id,
    p_resource_type, p_resource_id, p_decision, p_reason_code,
    p_request_correlation_id, p_safe_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- The owner is re-pinned: a SECURITY DEFINER function runs as its OWNER, so the
-- replacement must not be left owned by whichever role happened to apply it.
alter function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · ACCESS CONTROL — re-asserted, never widened
--
-- REVOKE before GRANT. The writer is reachable by service_role and by nobody
-- else: not PUBLIC, not anon, not authenticated. No table privilege is touched.
-- ════════════════════════════════════════════════════════════════════════════

revoke all on function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) from public;
revoke all on function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) from anon;
revoke all on function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) from authenticated;
revoke all on function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) from service_role;

grant execute on function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) to service_role;

comment on constraint provider_operation_audit_operation_check on public.provider_operation_audit is
  'Closed provider operation vocabulary plus the separate ''unknown'' outlier. CB-004.2 added exactly one system-only value: sync.execute — authorize execution of THIS SPECIFIC already-created job, never generic provider sync.';

commit;