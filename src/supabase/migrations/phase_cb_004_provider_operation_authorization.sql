-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  VISION — CONNECTED BUSINESS                                              ║
-- ║  CB-004 — PROVIDER OPERATION AUTHORIZATION KERNEL                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- WHAT THIS FILE IS, AND WHAT IT IS NOT
--   It is the DATABASE half of the CB-004 authorization boundary: the
--   append-only audit trail every provider authorization decision is written to,
--   and the ONE writer of that trail.
--
--   It is NOT the authorization decision. The decision is made by
--   base44/shared/providers/authorization.ts, which resolves the canonical actor
--   through the existing Security Kernel (authenticateActor →
--   authorizeBusinessAccess → validateBusinessScope), derives the business from
--   the RESOURCE ROW rather than the request, maps the operation to a required
--   permission, validates resource state, and then calls the function below.
--
--   The database cannot decide who a caller is, so it does not pretend to. What
--   it CAN enforce, it enforces structurally: the vocabularies, the shape of an
--   audit record, the impossibility of rewriting history, and the rejection of
--   credential-shaped metadata. Those are the properties this file exists to make
--   provable rather than promised.
--
-- ── SERVICE ROLE IS CAPABILITY, NOT AUTHORIZATION ───────────────────────────
--   service_role can reach every row in this database. That is why this file
--   gives it NO write privilege on the audit table at all: its only path to an
--   audit row is the validating function. An audit trail a compromised or
--   careless caller can write directly to is not a trail.
--
-- ── REUSE, NOT REPLACEMENT ─────────────────────────────────────────────────
--   No user system, no actor model, no business-membership logic and no
--   permission table is created here. Business membership already lives in the
--   Security Kernel (business_entities.profile_id, assigned_advisor_id,
--   business_team_members, business_owners, advisor_assignments,
--   expert_advisor_access, profiles.app_role) and is reused unchanged. This file
--   adds ONE relation and ONE function.
--
-- ── THE SEC-031 DEFAULT-ACL HAZARD IS LIVE HERE, AND IS CLOSED EXPLICITLY ──
--   Unlike CB-002 (functions only), CB-004 creates a RELATION, so
--   pg_default_acl can seed privileges on it for anon/authenticated. Nothing in
--   this file relies on defaults: the table and the function each get an explicit
--   REVOKE from PUBLIC, anon, authenticated AND service_role, and then the exact
--   GRANT that is intended and nothing more.
--
-- ── APPEND-ONLY, STRUCTURALLY ──────────────────────────────────────────────
--   RLS is enabled explicitly. No role holds INSERT, UPDATE or DELETE on the
--   table: the ONLY writer is the SECURITY DEFINER function (which runs as its
--   owner, postgres), and its body contains exactly one INSERT and no UPDATE or
--   DELETE anywhere. "Append-only" is therefore not a convention the application
--   is asked to respect — it is the absence of a privilege.
--
-- EXPECTED RESULT AFTER DEPLOYMENT
--   public.provider_operation_audit = 0 rows
--   business_connections             = 0 rows
--   provider_credentials             = 0 rows
--   business_facts / _evidence / _conflicts = 0 / 0 / 0   (UNKNOWN ≠ ZERO)
-- ============================================================================

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · THE APPEND-ONLY SECURITY AUDIT TRAIL
--
-- This is a SECURITY record. It is not provider observation, not financial
-- evidence, not Digital Twin evidence and not conversation history. It answers
-- "who asked to do what, against which resource, and what was decided".
--
-- NULLABILITY IS DELIBERATE, AND SO IS EVERY DEFAULT IT IMPLIES
--   · provider is NULLABLE because a DENIED call may never have resolved a
--     provider (an out-of-vocabulary operation, an unresolvable actor). The
--     constraint below is written `provider is null or provider in (...)` on
--     purpose: a bare `provider in (...)` would evaluate to NULL for a NULL
--     provider and PASS, which is the classic three-valued-logic hole. An ALLOW
--     is separately required to carry a provider, because an authorized
--     operation always resolved one.
--   · business_id / business_connection_id / authorization_attempt_id are
--     ON DELETE SET NULL, never CASCADE. This is an audit trail: deleting a
--     business must not delete the record that someone acted on it.
--   · actor_profile_id is ON DELETE SET NULL for the same reason.
-- ============================================================================

create table if not exists public.provider_operation_audit (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamptz not null default now(),

  actor_kind               text not null,
  actor_profile_id         uuid null references public.profiles(id) on delete set null,
  business_id              uuid null references public.business_entities(id) on delete set null,

  provider                 text null,
  operation                text not null,

  business_connection_id   uuid null references public.business_connections(id) on delete set null,
  authorization_attempt_id uuid null references public.provider_authorization_attempts(id) on delete set null,

  resource_type            text null,
  resource_id              text null,

  decision                 text not null,
  reason_code              text not null,

  request_correlation_id   text null,
  safe_metadata            jsonb not null default '{}'::jsonb,

  -- ── vocabulary: closed, bounded, fail-closed ────────────────────────────
  constraint provider_operation_audit_actor_kind_check
    check (actor_kind in ('user', 'system')),

  constraint provider_operation_audit_provider_check
    check (provider is null or provider in ('quickbooks', 'plaid')),

  constraint provider_operation_audit_operation_check
    check (operation in (
      'connection.create', 'connection.read', 'connection.update', 'connection.disconnect',
      'authorization.begin', 'authorization.complete', 'authorization.cancel',
      'credential.create', 'credential.resolve', 'credential.rotate', 'credential.revoke',
      'accounts.read', 'balances.read', 'transactions.read',
      'sync.start', 'sync.read', 'sync.retry',
      'webhook.process'
    ) or operation = 'unknown'),

  constraint provider_operation_audit_decision_check
    check (decision in ('allow', 'deny')),

  constraint provider_operation_audit_reason_code_check
    check (reason_code in (
      'AUTHORIZED', 'ACTOR_UNRESOLVED', 'BUSINESS_ACCESS_DENIED', 'PERMISSION_DENIED',
      'RESOURCE_NOT_FOUND', 'RESOURCE_BUSINESS_MISMATCH', 'CONNECTION_INACTIVE',
      'OPERATION_NOT_ALLOWED', 'INVALID_OPERATION', 'AUTHORIZATION_ATTEMPT_INVALID',
      'CREDENTIAL_UNAVAILABLE', 'PROVIDER_AUTHENTICITY_FAILED', 'SYSTEM_CONTEXT_UNRESOLVED'
    )),

  constraint provider_operation_audit_resource_type_check
    check (resource_type is null or resource_type in (
      'connection', 'credential', 'authorization_attempt', 'sync_job', 'webhook_event',
      'account', 'balance', 'transaction'
    )),

  -- ── record SHAPE: an audit row cannot state an impossible outcome ────────
  -- ALLOW and AUTHORIZED are the same fact, in both directions: no allow may
  -- cite another reason, and no other reason may be recorded as an allow.
  constraint provider_operation_audit_decision_reason_consistency
    check ((decision = 'allow') = (reason_code = 'AUTHORIZED')),

  -- An authorized operation always resolved a provider.
  constraint provider_operation_audit_allow_has_provider
    check (decision <> 'allow' or provider is not null),

  -- An operation outside the vocabulary is never an allow: its existence is
  -- recorded for the audit, its execution never happens.
  constraint provider_operation_audit_unknown_operation_check
    check (operation <> 'unknown' or decision = 'deny'),

  -- A SYSTEM row never names a profile (§18: a scheduled/background path must
  -- not manufacture an identity). A USER row names one — except when the whole
  -- reason for the denial is that no actor could be resolved, which is exactly
  -- the case the audit most needs to record.
  constraint provider_operation_audit_actor_identity_shape
    check (
      (actor_kind = 'user'
        and (actor_profile_id is not null or reason_code = 'ACTOR_UNRESOLVED'))
      or (actor_kind = 'system' and actor_profile_id is null)
    ),

  -- ── bounded free-text: identifiers only, never bodies ───────────────────
  constraint provider_operation_audit_correlation_shape
    check (
      request_correlation_id is null
      or (length(request_correlation_id) between 1 and 128
          and request_correlation_id !~ '[[:cntrl:]]')
    ),

  constraint provider_operation_audit_resource_id_shape
    check (resource_id is null or length(resource_id) between 1 and 128),

  -- safe_metadata is aggressively bounded: an object, capped in size. It carries
  -- identifiers, states and classifications, never a request or response body.
  constraint provider_operation_audit_safe_metadata_shape
    check (jsonb_typeof(safe_metadata) = 'object' and length(safe_metadata::text) <= 4096)
);

comment on table public.provider_operation_audit is
  'CB-004 append-only authorization audit. Written ONLY by provider_operation_audit_record(). '
  'Records ALLOW and DENY alike. Carries no credential plaintext, no tokens and no request bodies. '
  'No role holds INSERT, UPDATE or DELETE on this table.';

comment on column public.provider_operation_audit.operation is
  'Closed provider-operation vocabulary. The literal ''unknown'' records that an operation OUTSIDE the '
  'vocabulary was attempted; the caller-supplied string is deliberately not stored, so this column '
  'cannot become an unbounded input sink.';

-- Lookup paths the audit actually needs. Three, because every one of them is a
-- question an incident responder asks: what happened to this business, to this
-- actor, on this connection.
create index if not exists provider_operation_audit_business_idx
  on public.provider_operation_audit (business_id, created_at desc);
create index if not exists provider_operation_audit_actor_idx
  on public.provider_operation_audit (actor_profile_id, created_at desc);
create index if not exists provider_operation_audit_connection_idx
  on public.provider_operation_audit (business_connection_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · THE ONE WRITER
--
-- SECURITY DEFINER, owned by postgres, search_path pinned, EXECUTE granted to
-- service_role only. It validates what a record may contain and then inserts.
--
-- THE RECURSIVE METADATA GUARD
--   The application-side guard (shared/providers/vocabulary.ts) is the first
--   line; this is the second, and it is the one that can be PROVEN, because it
--   lives where the row is written. It walks every object and array, to a bounded
--   depth, and REJECTS the whole call if any key at any depth is
--   credential-shaped. It never silently strips: a write that tried to smuggle a
--   token must fail loudly rather than quietly lose a field.
--
--   The walk is written with a CASE-selected input on BOTH branches — jsonb_each
--   always receives an object and jsonb_array_elements always an array, using an
--   empty literal on the branch that does not apply. A set-returning function
--   called on a scalar raises, and a guard that can ERROR on legitimate metadata
--   would be worse than no guard at all.
-- ============================================================================

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
         'webhook.process'
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
  -- The two operations that legitimately have no interactive actor are the only
  -- ones a system row may record as authorized. The module declares the same two
  -- (SYSTEM_OPERATIONS) and the harness asserts the two agree.
  if p_actor_kind = 'system'
     and p_decision = 'allow'
     and p_operation not in ('credential.resolve', 'webhook.process') then
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

alter function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · ACCESS CONTROL — explicit, in every direction
--
-- REVOKE before GRANT: the reverse order lands on nothing when an inherited or
-- default privilege is still present, which is exactly how a lockdown silently
-- fails to lock anything down.
--
-- The audit table gives service_role SELECT and NOTHING ELSE. It has no INSERT
-- (the function is the only writer), no UPDATE and no DELETE (history cannot be
-- rewritten by the role the application actually holds).
-- ============================================================================

alter table public.provider_operation_audit enable row level security;

revoke all on table public.provider_operation_audit from public;
revoke all on table public.provider_operation_audit from anon;
revoke all on table public.provider_operation_audit from authenticated;
revoke all on table public.provider_operation_audit from service_role;

grant select on table public.provider_operation_audit to service_role;

revoke all on function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) from public;
revoke all on function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) from anon;
revoke all on function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) from authenticated;
revoke all on function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) from service_role;

grant execute on function public.provider_operation_audit_record(text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb) to service_role;

commit;