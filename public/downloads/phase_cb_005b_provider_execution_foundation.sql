-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  VISION — CONNECTED BUSINESS                                              ║
-- ║  CB-005B — PROVIDER EXECUTION FOUNDATION                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- THE INVARIANT THIS FILE EXISTS TO MAKE STRUCTURAL
--
--   An externally callable endpoint can WAKE a worker. It cannot grant EXECUTION
--   AUTHORITY. Authority exists only after a server-side worker atomically CLAIMS
--   an eligible job and the database independently VERIFIES that claim.
--
--   Nothing in this file accepts an authority claim from a caller. Every function
--   below re-derives the business, connection, credential, provider, operation and
--   attempt identity from the immutable job ROW, reads every scheduling and deadline
--   instant from THE DATABASE'S OWN WALL CLOCK (clock_timestamp()), and refuses —
--   loudly, leaving nothing written — when the row does not agree with the caller.
--
--   WHY clock_timestamp() AND NEVER now(): now() is TRANSACTION START time and does
--   not advance while a transaction runs, so one long transaction — a worker holding
--   a row lock, waiting on an advisory lock, or simply slow — would keep answering
--   every deadline question with the instant it BEGAN, and could renew, ingest and
--   complete long after its budget expired while every check still read as though it
--   were inside. clock_timestamp() advances with the wall clock at the moment it is
--   called, which is what makes a deadline a deadline. It is read at the decision
--   itself and — in the two writers that wait on a lock — AFTER the lock is held, so
--   a wait can never be paid for with stale time. No function body in this file reads
--   now(): the only remaining uses are the created_at / observed_at column DEFAULTS,
--   which record when a row entered the world rather than deciding anything.
--
-- WHAT EXISTS HERE
--   three tables      provider_sync_jobs · provider_sync_checkpoints · provider_observations
--   seven functions   enqueue · claim · renew_lease · complete · sweep · authorize · ingest
--   access control    RLS on all three tables, service_role SELECT-only, function-only writes
--
-- WHAT DELIBERATELY DOES NOT EXIST HERE
--   · no provider API call, no HTTP client, no Vault access, no credential resolution
--   · no business-fact, fact-evidence or fact-conflict write of any kind (Digital Twin freeze)
--   · no dashboard-metric population from observations (observations are a STAGING layer)
--   · no operator cancel/block surface (no CB-005B path enters a state it cannot leave)
--   · no evidence-retirement surface: an observation cannot be deleted, directly or
--     indirectly, by any role or any upstream deletion (see the deletion matrix below)
--
-- ── JOB STATE MACHINE (five states, all reachable, all exited) ──────────────
--   queued     → claimed            (claim)
--   queued     → failed             (sweep: attempt budget already exhausted)
--   retry_wait → claimed            (claim, once next_attempt_at <= clock_timestamp())
--   retry_wait → failed             (sweep: attempt budget exhausted)
--   claimed    → completed          (fenced completion by the LIVE attempt)
--   claimed    → retry_wait         (fenced retryable completion, attempts remain)
--   claimed    → failed             (fenced terminal completion, OR retryable with
--                                    the attempt budget exhausted → transient_exhausted)
--   claimed    → claimed            (lease-expired RECOVERY: a new attempt identity,
--                                    a new lease, attempt_count incremented again)
--   completed · failed              TERMINAL — no transition exists out of either
--
-- ── LEASE FENCING (how a stale worker is structurally excluded) ─────────────
--   A live claim is a LEASE, never an eternal boolean. The lease columns exist
--   exactly while the job is claimed:
--
--     constraint provider_sync_jobs_lease_shape
--       claimed  → claimed_by, claimed_at, attempt_id, attempt_started_at,
--                  lease_id, lease_expires_at ALL non-null
--       otherwise→ lease_id and lease_expires_at BOTH null
--
--   Every write path (renew, complete, ingest) requires ALL FOUR of
--     status = 'claimed'  AND  attempt_id matches  AND  lease_id matches  AND
--     claimed_by matches  AND  lease_expires_at > clock_timestamp()  AND
--     clock_timestamp() < attempt_started_at + max_attempt_seconds
--   so a worker whose lease was superseded, recovered or expired matches zero rows
--   and changes nothing. Because a NON-claimed job can never hold non-null lease
--   columns, "a stale lease that still looks live" is not merely refused — it is
--   unrepresentable.
--
-- ── PER-ATTEMPT EXECUTION LIMIT, ENFORCED BY THE DATABASE ───────────────────
--   attempt_started_at + max_attempt_seconds is the attempt's ABSOLUTE DEADLINE, and
--   four independent things enforce it, because one is not enough:
--
--     1. the LEASE IS CAPPED AT IT. claim grants
--        least(clock_timestamp() + lease_seconds, clock_timestamp() + max_attempt_seconds),
--        so a caller asking for a 900-second lease on a 30-second attempt receives a
--        30-second one. The cap is not merely computed — constraint
--        provider_sync_jobs_lease_within_attempt makes a lease beyond the budget
--        UNREPRESENTABLE, so no writer can store one by any route.
--     2. RENEWAL IS REFUSED AT OR AFTER IT (strict `<`), and what it grants is capped
--        at the same instant, so a runaway worker cannot hold a job open by renewing.
--        The application budget is bounded below it (see executionPolicy.ts).
--     3. AUTHORIZE REFUSES IT INDEPENDENTLY of the lease (claim_state
--        'attempt_expired'), so an expired attempt can never be presented as
--        executable even in a row whose lease still reads live.
--     4. INGEST AND COMPLETE EACH REFUSE IT — ingest before any observation or
--        checkpoint mutation, and again at the mutation boundary after every lock wait;
--        complete with its own verdict, so a stale completion cannot be mistaken for a
--        superseded claim.
--
--   RECOVERY IS UNAFFECTED. An attempt that outlives its deadline simply stops being
--   admissible: its lease has expired with it, so claim() reclaims the job with a new
--   attempt while budget remains, and sweep() retires it when the budget is spent.
--   Nothing here strands a job, because the cap above means "deadline passed" always
--   implies "lease expired", which is exactly the recovery predicate.
--
-- ── THE SCHEDULE COLUMN (next_attempt_at) ──────────────────────────────────
--   next_attempt_at is the ONE nullable-by-design column on provider_sync_jobs, and
--   its nullability CARRIES MEANING rather than absence:
--
--     queued · retry_wait   → NOT NULL. The instant the job becomes claimable.
--     claimed               → NULL. The LEASE is the only clock that governs it.
--     completed · failed    → NULL. There is no next attempt to run.
--
--   constraint provider_sync_jobs_schedule_shape makes that total, because the
--   claim predicate is `next_attempt_at <= clock_timestamp()` — NULL, never
--   TRUE, for a missing schedule — so a claimable job without one would sit
--   unclaimable for ever and nothing would report it. Every writer therefore states
--   the schedule explicitly: enqueue sets it, claim clears it, complete sets the
--   retry instant or clears it, and sweep clears it on the way to failed.
--
--   The renewal budget is bounded the same way: attempt_bounds caps
--   lease_renewal_count at 100, so renew_lease REFUSES past it (returns false, which
--   the worker reads as a lost lease) instead of tripping the constraint.
--
-- ── A DUPLICATE IS NOT A CONFLICT ──────────────────────────────────────────
--   Re-delivering a page is normal and idempotent: same dedup_key, same
--   payload_hash → counted as a duplicate, nothing inserted, cursor advanced.
--   The same dedup_key with a DIFFERENT payload_hash cannot be stored (the row is
--   immutable) and is not a new identity (the key already names the version), so it
--   is REFUSED and the batch rolls back whole, cursor included. Absorbing it by
--   advancing the cursor would be a permanent, invisible gap in the evidence store,
--   because no later run re-fetches a page the cursor has already passed.
--   The same rule covers a contradiction INSIDE one batch: the delivered set is
--   classified from the delivered elements plus committed rows BEFORE anything is
--   written, so two deliveries of one page that disagree are refused rather than
--   half-stored, and no count ever depends on a statement seeing its own insert.
--
-- ── DELETION: ONE MATRIX, ONE RULE ─────────────────────────────────────────
--   Deleting the BUSINESS itself is the only tenant-root removal, and it too is
--   refused while evidence exists: an observation is retained until it is retired
--   deliberately, and CB-005B ships no retirement surface.
--
--   PARENT DELETED            RULE      WHY, AND WHAT THE EVIDENCE DOES
--   business_entities         RESTRICT  the tenant root: refused while any
--                                       observation exists beneath it (through the
--                                       connection key) — retention outranks a
--                                       cascading tenant removal
--   business_connections      RESTRICT  disconnect/revoke is a STATUS in CB-001,
--                                       never a row deletion; evidence is retained
--   provider_credentials      SET NULL  rotation supersedes and revokes, never
--                                       deletes; evidence survives with a null
--                                       credential_id          [but see the note]
--   provider_sync_jobs        RESTRICT  a job is orchestration, its observations are
--                                       evidence: a job carrying evidence cannot be
--                                       deleted at all
--   provider_sync_checkpoints CASCADE   a checkpoint is resumable POSITION, not
--                                       evidence — removing it is the point
--
--   NOTE ON THE CREDENTIAL ROW: the key from provider_observations is SET NULL, so a
--   deleted credential never takes evidence with it. A credential whose JOB carries
--   evidence is still refused, because deleting it cascades to that job, and the job
--   is protected by RESTRICT. Both rules pull the same way: the evidence stays, and
--   the refusal is loud rather than partial.
--
--   WHY NOT CASCADE, IN ONE LINE: a cascade is an invisible deletion. It removes
--   evidence that no one asked to remove, from a record the operator was not even
--   looking at, and it does so silently — while RESTRICT converts exactly that into
--   an error the operator must reckon with.
--
-- ── AUTHORIZATION (no vocabulary broadening) ───────────────────────────────
--   This file does NOT touch public.provider_operation_audit. Execution authority
--   still flows through the certified CB-004/CB-004.2 kernel and the certified
--   audit writer: operation 'sync.execute' (system-only, already in the closed
--   vocabulary), resource_type 'sync_job', resource_id = the claimed job. No new
--   operation, no new reason code, no new resource type is introduced.
--
-- ── EXPECTED RESULT AFTER DEPLOYMENT ────────────────────────────────────────
--   provider_sync_jobs = 0 · provider_sync_checkpoints = 0 · provider_observations = 0
--   business_facts = 0 · business_fact_evidence = 0 · business_fact_conflicts = 0
--   (UNKNOWN ≠ ZERO: these are counts, not judgements about upstream sources.)
-- ============================================================================

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 0 · INSTALL POSTURE — SINGLE-USE, FAIL-CLOSED
--
-- This migration is applied ONCE, to a PRISTINE schema. It deliberately does NOT
-- attempt to be repeatable, because repeatability cannot be made honest here without
-- destructive DDL: CREATE TABLE IF NOT EXISTS silently ACCEPTS an existing table whose
-- shape may have drifted, and a policy cannot be re-created without dropping it —
-- which would reset the very access control this phase exists to pin. Repairing a
-- half-installed schema is an operator's deliberate decision, taken with the read-only
-- preflight (phase_cb_005b_provider_execution_foundation_preflight.sql) in hand; it is
-- never something this file does to a database that may already hold evidence.
--
-- The guard below therefore FAILS CLOSED before a single object is created, naming
-- everything it found, so an accidental second run can neither overwrite a shape nor
-- inherit a stale grant. It runs inside the migration's own transaction, so a refusal
-- leaves the database exactly as it was. There is no DROP anywhere in this file: the
-- migration never removes an object to make itself re-runnable.
-- ============================================================================

do $$
declare
  v_existing text;
begin
  select string_agg(x.obj, ', ' order by x.obj) into v_existing
    from (
      select 'table public.' || c.relname as obj
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'p')
         and c.relname in ('provider_sync_jobs', 'provider_sync_checkpoints', 'provider_observations')
      union all
      select 'function public.' || p.proname as obj
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('provider_sync_job_enqueue', 'provider_sync_job_claim',
                           'provider_sync_job_renew_lease', 'provider_sync_job_complete',
                           'provider_sync_job_sweep', 'provider_sync_job_authorize',
                           'provider_sync_observation_ingest')
    ) x;
  if v_existing is not null then
    raise exception 'phase_cb_005b_provider_execution_foundation: SINGLE-USE MIGRATION REFUSED — the target schema is not pristine (already present: %). Run phase_cb_005b_provider_execution_foundation_preflight.sql to see the full posture, then reset this database deliberately. This migration never drops, rewrites or repairs existing objects.', v_existing
      using errcode = 'P0001';
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · provider_sync_jobs — the immutable execution unit
--
-- A job is the ONLY thing that can be executed. It binds, permanently and on the
-- server side: one canonical business, one canonical connection, one credential,
-- one provider, one provider operation. Everything downstream is derived from
-- this row, never from a request.
-- ============================================================================

create table if not exists public.provider_sync_jobs (
  id                    uuid primary key default gen_random_uuid(),

  business_id           uuid not null references public.business_entities(id) on delete cascade,
  business_connection_id uuid not null,
  credential_id         uuid not null,

  -- The credential ROTATION UNIT this job executes against: (connection,
  -- credential_type). CB-002/CB-002.1 address credentials by exactly that unit and
  -- certify rotation inside it, so binding the UNIT (not merely one credential row)
  -- is what makes execution rotation-correct: a rotated successor is picked up
  -- without re-enqueuing, while a revoked/empty unit fails closed.
  credential_type       text not null,

  provider              text not null,
  provider_operation    text not null,

  status                text not null default 'queued',
  priority              integer not null default 100,

  attempt_count         integer not null default 0,
  max_attempts          integer not null default 5,
  max_attempt_seconds   integer not null default 600,

  -- current attempt identity — never cleared, so the last attempt survives as evidence
  attempt_id            uuid null,
  attempt_started_at    timestamptz null,
  claimed_by            text null,
  claimed_at            timestamptz null,

  -- the LIVE lease. Non-null exactly while status = 'claimed' (see lease_shape).
  lease_id              uuid null,
  lease_expires_at      timestamptz null,
  lease_renewal_count   integer not null default 0,

  -- THE SCHEDULE, and the one column whose NULLABILITY is load-bearing. It is
  -- non-null exactly while the job is queued or retry_wait — the instant it becomes
  -- claimable — and null while claimed (the LEASE governs recovery, not a schedule)
  -- or terminal (there is no next attempt). provider_sync_jobs_schedule_shape below
  -- makes that total, which is what keeps the claim predicate from evaluating to
  -- NULL and silently stranding a job forever.
  next_attempt_at       timestamptz null default now(),

  last_error_class      text null,
  last_error_code       text null,
  last_error_message    text null,

  completed_at          timestamptz null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- ── tenant integrity, enforced STRUCTURALLY, not by application code ─────
  -- Composite FKs against the CB-001 same-business anchors: a job belonging to
  -- Business A is structurally incapable of naming a connection or credential of
  -- Business B. The connection FK cascades (a deleted connection ends its work);
  -- the credential FK cascades for the same reason — job history is orchestration,
  -- not evidence (observation rows are the evidence, and they are immutable).
  -- BOTH CASCADES STOP AT THE EVIDENCE BOUNDARY: provider_observations refuses the
  -- deletion (RESTRICT), so a cascade begun here can never remove an observation —
  -- the whole statement is refused instead, leaving the job, the connection, the
  -- credential and every observation exactly as they were.
  constraint provider_sync_jobs_connection_same_business_fkey
    foreign key (business_connection_id, business_id)
    references public.business_connections (id, business_id) on delete cascade,
  constraint provider_sync_jobs_credential_same_business_fkey
    foreign key (credential_id, business_id)
    references public.provider_credentials (id, business_id) on delete cascade,

  -- anchors the two child composite FKs below use
  constraint provider_sync_jobs_id_business_unique unique (id, business_id),
  constraint provider_sync_jobs_id_connection_unique unique (id, business_connection_id),

  -- ── closed vocabularies ─────────────────────────────────────────────────
  constraint provider_sync_jobs_provider_check
    check (provider in ('quickbooks', 'plaid')),
  constraint provider_sync_jobs_operation_check
    check (provider_operation in ('sync.start', 'accounts.read', 'balances.read', 'transactions.read')),
  constraint provider_sync_jobs_credential_type_check
    check (credential_type in (
      'plaid_access', 'quickbooks_refresh', 'quickbooks_access', 'xero_refresh',
      'xero_access', 'wave_access', 'wave_refresh', 'payroll_access', 'crm_access'
    )),
  constraint provider_sync_jobs_status_check
    check (status in ('queued', 'claimed', 'retry_wait', 'completed', 'failed')),
  constraint provider_sync_jobs_error_class_check
    check (last_error_class is null or last_error_class in (
      'transient', 'rate_limited', 'timeout', 'provider_error', 'provider_protocol_error',
      'configuration_error', 'permanent', 'lease_lost', 'transient_exhausted'
    )),

  -- ── shape: a row cannot state an impossible lifecycle ───────────────────
  constraint provider_sync_jobs_lease_shape
    check (
      (status = 'claimed'
        and claimed_by is not null and claimed_at is not null
        and attempt_id is not null and attempt_started_at is not null
        and lease_id is not null and lease_expires_at is not null)
      or (status <> 'claimed' and lease_id is null and lease_expires_at is null)
    ),
  -- THE LEASE MAY NEVER OUTLIVE THE ATTEMPT BUDGET. attempt_started_at +
  -- max_attempt_seconds is the attempt's absolute deadline, and a lease is only ever
  -- granted up to it: claim caps its grant, renew caps its extension. This constraint
  -- makes the alternative UNREPRESENTABLE rather than merely refused — a row claiming a
  -- lease beyond its own budget cannot be stored by any route — so "the lease reads
  -- live" can never outvote the deadline in any reader, and the recovery predicate
  -- ("deadline passed" ⇒ "lease expired") holds as a property of the table itself.
  constraint provider_sync_jobs_lease_within_attempt
    check (
      status <> 'claimed'
      or extract(epoch from (lease_expires_at - attempt_started_at)) <= max_attempt_seconds
    ),
  constraint provider_sync_jobs_attempt_bounds
    check (
      attempt_count >= 0 and attempt_count <= max_attempts
      and max_attempts between 1 and 10
      and max_attempt_seconds between 30 and 3600
      and priority between 0 and 1000
      and lease_renewal_count between 0 and 100
    ),
  constraint provider_sync_jobs_terminal_shape
    check (
      (status = 'completed' and completed_at is not null and last_error_class is null)
      or (status <> 'completed')
    ),
  constraint provider_sync_jobs_failure_shape
    check (status <> 'failed' or last_error_class is not null),
  constraint provider_sync_jobs_retry_shape
    check (
      status <> 'retry_wait'
      or (next_attempt_at is not null and attempt_count >= 1 and last_error_class is not null)
    ),
  -- THE SCHEDULE INVARIANT — total, not conditional. A queued or retry_wait job must
  -- carry the instant it becomes claimable: the claim predicate is
  -- `next_attempt_at <= clock_timestamp()`, which is NULL — never TRUE — for a
  -- missing schedule,
  -- so a schedule-less claimable job would be silently UNCLAIMABLE for ever, with
  -- nothing scheduled and nothing to report it. A claimed job carries no schedule
  -- (the lease expiry is the only clock that governs its recovery), and neither does
  -- a terminal one: there is no next attempt left to run.
  constraint provider_sync_jobs_schedule_shape
    check (
      (status in ('queued', 'retry_wait') and next_attempt_at is not null)
      or (status in ('claimed', 'completed', 'failed') and next_attempt_at is null)
    ),

  -- ── bounded free text: identifiers and classifications only ─────────────
  constraint provider_sync_jobs_claimed_by_shape
    check (claimed_by is null or (length(claimed_by) between 1 and 128 and claimed_by !~ '[[:cntrl:]]')),
  constraint provider_sync_jobs_error_code_shape
    check (last_error_code is null or (length(last_error_code) between 1 and 96 and last_error_code !~ '[[:cntrl:]]')),
  constraint provider_sync_jobs_error_message_shape
    check (last_error_message is null or (length(last_error_message) between 1 and 512 and last_error_message !~ '[[:cntrl:]]'))
);

comment on table public.provider_sync_jobs is
  'CB-005B execution unit. One canonical business + connection + credential + provider + operation, '
  'bound server-side and immutable. A job is the only execution authorization boundary; no caller-supplied '
  'authority is ever read. Written ONLY by provider_sync_job_* functions (no role holds INSERT/UPDATE/DELETE). '
  'Carries no credential plaintext, no provider payload and no business fact.';

comment on column public.provider_sync_jobs.attempt_id is
  'Identity of the CURRENT attempt. Set by provider_sync_job_claim() and never cleared: it survives as the '
  'last-attempt evidence, which is exactly what the observation rows reference as their writer identity.';

-- Claimable path (queued/retry_wait), expired-lease recovery path (claimed), and
-- the two read paths an operator actually asks for.
create index if not exists provider_sync_jobs_claimable_idx
  on public.provider_sync_jobs (status, next_attempt_at, priority, created_at)
  where status in ('queued', 'retry_wait');
create index if not exists provider_sync_jobs_expired_lease_idx
  on public.provider_sync_jobs (lease_expires_at)
  where status = 'claimed';
create index if not exists provider_sync_jobs_business_idx
  on public.provider_sync_jobs (business_id, created_at desc);
create index if not exists provider_sync_jobs_connection_idx
  on public.provider_sync_jobs (business_connection_id, created_at desc);

-- At most ONE live job per (connection, provider, operation). This is a hard
-- anti-retry-storm guarantee: duplicate enqueues cannot multiply in-flight work,
-- and it is enforced by the database rather than by the enqueue function's logic.
create unique index if not exists provider_sync_jobs_one_active_per_scope_idx
  on public.provider_sync_jobs (business_connection_id, provider, provider_operation)
  where status in ('queued', 'claimed', 'retry_wait');

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · provider_sync_checkpoints — resumable position, advanced only by commit
--
-- §5: a checkpoint is NEVER advanced on its own. It is advanced inside
-- provider_sync_observation_ingest(), in the SAME transaction as the observations
-- that justify it, after a compare-and-swap on cursor_version. There is no
-- standalone advance function, so "advance without committing" has no API.
--
-- TWO CURSOR KINDS, because they need different proofs:
--   ordered — the provider exposes a meaningful ordering value. Advancement must be
--             STRICTLY MONOTONIC (next > current), enforced numerically.
--   opaque  — the provider returns a token with no order. Advancing it is legal but
--             must be EXPLICIT: cursor_version is the CAS token, and expected_version
--             must match the committed version or the whole unit is refused.
-- ============================================================================

create table if not exists public.provider_sync_checkpoints (
  id                    uuid primary key default gen_random_uuid(),

  business_id           uuid not null,
  business_connection_id uuid not null,
  job_id                uuid not null,

  checkpoint_scope      text not null,
  cursor_kind           text not null,

  cursor_ordinal        numeric null,
  cursor_token          text null,
  cursor_version        bigint not null default 0,

  last_batch_id         uuid null,
  last_observation_id   uuid null,
  last_attempt_id       uuid null,
  last_lease_id         uuid null,
  last_advanced_at      timestamptz null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- CASCADE IS DELIBERATE HERE, AND ONLY HERE. A checkpoint is a resumable POSITION,
  -- not evidence: once the job it belongs to is gone the position has no meaning, so
  -- keeping it would be the orphan, not removing it. No evidence hangs off a
  -- checkpoint — the observations hang off the job, and they refuse the deletion
  -- (RESTRICT), which means a job carrying evidence cannot be deleted at all and this
  -- cascade can never fire over evidence in the first place.
  constraint provider_sync_checkpoints_job_same_business_fkey
    foreign key (job_id, business_id)
    references public.provider_sync_jobs (id, business_id) on delete cascade,
  constraint provider_sync_checkpoints_job_same_connection_fkey
    foreign key (job_id, business_connection_id)
    references public.provider_sync_jobs (id, business_connection_id) on delete cascade,

  constraint provider_sync_checkpoints_job_scope_unique unique (job_id, checkpoint_scope),

  constraint provider_sync_checkpoints_kind_check
    check (cursor_kind in ('ordered', 'opaque')),
  -- A scope is a bounded, deterministic name — never caller-composed free text.
  constraint provider_sync_checkpoints_scope_shape
    check (checkpoint_scope ~ '^(accounts|balances|transactions|statement|invoices|journal)(:[A-Za-z0-9_.-]{1,64}){0,2}$'),
  constraint provider_sync_checkpoints_cursor_shape
    check (
      cursor_version >= 0
      and (cursor_ordinal is null or cursor_ordinal >= 0)
      and (cursor_token is null or (length(cursor_token) between 1 and 4096 and cursor_token !~ '[[:cntrl:]]'))
    ),
  -- The kind decides which cursor field is meaningful; the other MUST stay null.
  constraint provider_sync_checkpoints_kind_payload
    check (
      (cursor_kind = 'ordered' and cursor_token is null)
      or (cursor_kind = 'opaque' and cursor_ordinal is null)
    )
);

comment on table public.provider_sync_checkpoints is
  'CB-005B resumable position. Advanced ONLY by provider_sync_observation_ingest(), in the same transaction '
  'as the observations it accounts for, under a compare-and-swap on cursor_version. Never advanced ahead of '
  'uncommitted observations. No role holds INSERT/UPDATE/DELETE.';

create index if not exists provider_sync_checkpoints_job_idx
  on public.provider_sync_checkpoints (job_id, checkpoint_scope);
create index if not exists provider_sync_checkpoints_business_idx
  on public.provider_sync_checkpoints (business_id, updated_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · provider_observations — immutable, fenced, deduplicated staging evidence
--
-- AN OBSERVATION IS NOT A BUSINESS FACT. It is what a provider most recently said,
-- recorded verbatim, attributed to the exact attempt and lease that wrote it. The
-- Digital Twin stays frozen: nothing here writes business_facts, fact evidence or
-- conflicts, and nothing here populates dashboard metrics.
--
-- IDENTITY IS TWO AXES, ON PURPOSE (§4)
--   provider object identity  = provider_object_id (+ object_type)
--   observation version identity = source_version (+ value_kind)
--   dedup_key = sha256(business | provider | connection | object_type |
--                      provider_object_id | value_kind | source_version)
--   ⇒ a re-delivered page is idempotent (same key), while a genuine provider change
--     (new source_version) is a NEW row rather than a collapsed duplicate, and the
--     same object+version observed in two semantic dimensions (two value_kinds) is
--     two rows rather than a false collision.
--   payload_hash is computed by the database from the stored jsonb. The same
--   dedup_key delivered with a DIFFERENT payload_hash is REFUSED as a CONFLICT:
--   never silently merged, never overwritten (the row is immutable), and never
--   silently skipped — the whole batch rolls back, cursor included, so a
--   contradiction cannot be absorbed by advancing past it.
--
-- IMMUTABILITY IS THE ABSENCE OF A PRIVILEGE. No role holds INSERT, UPDATE or
-- DELETE here; the sole writer is the SECURITY DEFINER ingest function, whose body
-- contains exactly one INSERT and no UPDATE or DELETE of this table anywhere.
-- ============================================================================

create table if not exists public.provider_observations (
  id                    uuid primary key default gen_random_uuid(),

  business_id           uuid not null,
  business_connection_id uuid not null,
  credential_id         uuid null,

  -- the writer's identity, immutable: which job, which attempt, which lease
  job_id                uuid not null,
  attempt_id            uuid not null,
  lease_id              uuid not null,

  provider              text not null,
  provider_operation    text not null,

  -- semantic identity
  object_type           text not null,
  provider_object_id    text not null,
  value_kind            text not null,
  source_version        text not null,
  source_updated_at     timestamptz null,

  -- verbatim source payload + the database-computed fingerprints
  payload               jsonb not null,
  payload_hash          text not null,
  dedup_key             text not null,

  observed_at           timestamptz not null default now(),
  created_at            timestamptz not null default now(),

  -- ── EVIDENCE RETENTION: RESTRICT here, never CASCADE ─────────────────────
  -- An observation is append-only evidence, so NOTHING upstream of it may delete it
  -- indirectly. These three keys refuse the parent's deletion while evidence exists
  -- — loudly, aborting the whole statement — instead of carrying the evidence away
  -- with it. The matrix, and why each rule is the one it is:
  --
  --   a JOB            RESTRICT   A job is orchestration; the evidence it produced
  --                               is not. Deleting orchestration must never destroy
  --                               evidence, so a job that carries observations
  --                               cannot be deleted at all.
  --   a CONNECTION     RESTRICT   CB-001 expresses disconnect and revocation as a
  --                               STATUS and a timestamp, never by deleting the row,
  --                               so nothing legitimate needs this row to disappear
  --                               while evidence exists.
  --   a CREDENTIAL     SET NULL   Rotation supersedes and revokes; it never deletes.
  --                               If a credential row is deleted anyway, the evidence
  --                               survives with credential_id null and stays fully
  --                               attributed to its job, attempt and lease.
  --
  -- WHAT THIS DOES NOT WEAKEN · the composite SHAPE is untouched. Every key remains
  -- (id, business_id)-scoped, so same-business integrity is exactly as strong as it
  -- was: RESTRICT refuses a deletion, it never relaxes a tenant guarantee. And
  -- because a refused deletion aborts the entire statement — cascade included — no
  -- partial cascade can leave a half-deleted parent beside orphaned children.
  --
  -- WHAT IT DOES DECIDE · evidence retention OUTRANKS cascading cleanup. Deleting a
  -- connection, a credential, a job, or the business above them is refused for as
  -- long as evidence exists beneath it, rather than silently taking that evidence
  -- with it. Retiring evidence is therefore a deliberate, explicit act, and CB-005B
  -- deliberately ships no surface that performs it (see the deletion matrix in the
  -- header). The refusal is bounded and legible: an ordinary FK violation, raised
  -- before anything is removed.
  constraint provider_observations_job_same_business_fkey
    foreign key (job_id, business_id)
    references public.provider_sync_jobs (id, business_id) on delete restrict,
  constraint provider_observations_job_same_connection_fkey
    foreign key (job_id, business_connection_id)
    references public.provider_sync_jobs (id, business_connection_id) on delete restrict,
  constraint provider_observations_connection_same_business_fkey
    foreign key (business_connection_id, business_id)
    references public.business_connections (id, business_id) on delete restrict,
  -- PG15+ column-list SET NULL: deleting a credential must not delete the evidence
  -- it produced, and must not null a NOT NULL tenant column.
  constraint provider_observations_credential_same_business_fkey
    foreign key (credential_id, business_id)
    references public.provider_credentials (id, business_id) on delete set null (credential_id),

  constraint provider_observations_dedup_unique unique (dedup_key),

  constraint provider_observations_provider_check
    check (provider in ('quickbooks', 'plaid')),
  constraint provider_observations_operation_check
    check (provider_operation in ('sync.start', 'accounts.read', 'balances.read', 'transactions.read')),
  constraint provider_observations_object_type_check
    check (object_type in (
      'account', 'balance', 'transaction', 'journal_entry', 'invoice', 'payment',
      'bill', 'payout', 'contact', 'vendor', 'customer', 'category', 'statement', 'other'
    )),
  constraint provider_observations_value_kind_check
    check (value_kind in (
      'amount', 'currency', 'balance', 'quantity', 'rate', 'status', 'date',
      'period', 'description', 'identifier', 'text', 'reference', 'json'
    )),

  constraint provider_observations_identity_shape
    check (
      length(provider_object_id) between 1 and 256 and provider_object_id !~ '[[:cntrl:]]'
      and length(source_version) between 1 and 256 and source_version !~ '[[:cntrl:]]'
      and length(payload_hash) = 64 and payload_hash ~ '^[0-9a-f]{64}$'
      and length(dedup_key) = 64 and dedup_key ~ '^[0-9a-f]{64}$'
    ),
  -- Bounded payload: an observation is a normalised value envelope, never a raw
  -- provider document and never a request/response body.
  constraint provider_observations_payload_shape
    check (jsonb_typeof(payload) = 'object' and length(payload::text) <= 16384)
);

comment on table public.provider_observations is
  'CB-005B provider observations: immutable, attributable staging evidence. NOT business facts — the Digital '
  'Twin freeze holds (no business_facts / fact evidence / conflict write, no dashboard population). Every row '
  'is fenced to the exact job, attempt and lease that wrote it, and deduplicated on a canonical semantic key. '
  'No role holds INSERT/UPDATE/DELETE; the sole writer is provider_sync_observation_ingest(). Its job and '
  'connection keys are ON DELETE RESTRICT and its credential key is ON DELETE SET NULL, so no upstream '
  'deletion — a job, a connection, a credential or the business above them — can remove evidence indirectly.';

comment on column public.provider_observations.dedup_key is
  'sha256 over business | provider | connection | object_type | provider_object_id | value_kind | '
  'source_version. Computed BY THE DATABASE. A caller-supplied candidate is accepted only if it is '
  'byte-identical, so application/SQL drift is a loud failure rather than a silent split.';

create index if not exists provider_observations_object_idx
  on public.provider_observations (business_id, object_type, provider_object_id, value_kind, observed_at desc);
create index if not exists provider_observations_job_idx
  on public.provider_observations (job_id, created_at desc);
create index if not exists provider_observations_attempt_idx
  on public.provider_observations (attempt_id);
create index if not exists provider_observations_connection_idx
  on public.provider_observations (business_connection_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- 4 · THE SEVEN FUNCTIONS
--
-- Every one is SECURITY DEFINER, owned by postgres, search_path-pinned, and
-- EXECUTE-granted to service_role only. Together they are the complete mutation
-- surface of this phase: no role can write these tables by any other route.
-- ============================================================================

-- ── 4.1 enqueue ────────────────────────────────────────────────────────────
-- Creates one job, or returns the id of the live job that already covers this
-- (connection, provider, operation). Idempotent by construction: the partial
-- unique index is the authority, and the unique_violation branch resolves a race
-- by returning the winner rather than failing.
create or replace function public.provider_sync_job_enqueue(
  p_business_id          uuid,
  p_business_connection_id uuid,
  p_credential_id        uuid,
  p_provider             text,
  p_provider_operation   text,
  p_priority             integer default 100,
  p_max_attempts         integer default 5,
  p_max_attempt_seconds  integer default 600
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_conn public.business_connections;
  v_cred public.provider_credentials;
  v_id   uuid;
begin
  if p_business_id is null or p_business_connection_id is null or p_credential_id is null then
    raise exception 'provider_sync_job_enqueue: business, connection and credential are required'
      using errcode = '22023';
  end if;
  if p_provider is null or p_provider not in ('quickbooks', 'plaid') then
    raise exception 'provider_sync_job_enqueue: unsupported provider' using errcode = '22023';
  end if;
  if p_provider_operation is null or p_provider_operation not in
       ('sync.start', 'accounts.read', 'balances.read', 'transactions.read') then
    raise exception 'provider_sync_job_enqueue: unsupported provider operation' using errcode = '22023';
  end if;
  if p_priority is null or p_priority < 0 or p_priority > 1000 then
    raise exception 'provider_sync_job_enqueue: priority out of bounds' using errcode = '22023';
  end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 10 then
    raise exception 'provider_sync_job_enqueue: max_attempts out of bounds' using errcode = '22023';
  end if;
  if p_max_attempt_seconds is null or p_max_attempt_seconds < 30 or p_max_attempt_seconds > 3600 then
    raise exception 'provider_sync_job_enqueue: max_attempt_seconds out of bounds' using errcode = '22023';
  end if;

  -- The connection and the credential must both be THIS business's, and the
  -- credential must belong to THIS connection. Read from the tables, never assumed.
  select c.* into v_conn
    from public.business_connections c
   where c.id = p_business_connection_id and c.business_id = p_business_id;
  if v_conn.id is null then
    raise exception 'provider_sync_job_enqueue: connection not found in this business' using errcode = '22023';
  end if;
  if v_conn.provider <> p_provider then
    raise exception 'provider_sync_job_enqueue: connection provider does not match the requested provider'
      using errcode = '22023';
  end if;
  if v_conn.status in ('revoked', 'disconnected') then
    raise exception 'provider_sync_job_enqueue: connection is not usable for new work' using errcode = '22023';
  end if;

  select c.* into v_cred
    from public.provider_credentials c
   where c.id = p_credential_id and c.business_id = p_business_id;
  if v_cred.id is null then
    raise exception 'provider_sync_job_enqueue: credential not found in this business' using errcode = '22023';
  end if;
  if v_cred.business_connection_id <> p_business_connection_id then
    raise exception 'provider_sync_job_enqueue: credential does not belong to the connection'
      using errcode = '22023';
  end if;
  if v_cred.status <> 'active' then
    raise exception 'provider_sync_job_enqueue: credential is not active' using errcode = '22023';
  end if;

  select j.id into v_id
    from public.provider_sync_jobs j
   where j.business_connection_id = p_business_connection_id
     and j.provider = p_provider
     and j.provider_operation = p_provider_operation
     and j.status in ('queued', 'claimed', 'retry_wait')
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.provider_sync_jobs (
      business_id, business_connection_id, credential_id, credential_type,
      provider, provider_operation,
      priority, max_attempts, max_attempt_seconds, status, next_attempt_at
    ) values (
      p_business_id, p_business_connection_id, p_credential_id, v_cred.credential_type,
      p_provider, p_provider_operation,
      p_priority, p_max_attempts, p_max_attempt_seconds, 'queued', clock_timestamp()
    )
    returning id into v_id;
  exception when unique_violation then
    select j.id into v_id
      from public.provider_sync_jobs j
     where j.business_connection_id = p_business_connection_id
       and j.provider = p_provider
       and j.provider_operation = p_provider_operation
       and j.status in ('queued', 'claimed', 'retry_wait')
     limit 1;
  end;

  if v_id is null then
    raise exception 'provider_sync_job_enqueue: concurrent enqueue could not be resolved'
      using errcode = '40001';
  end if;
  return v_id;
end;
$$;

-- ── 4.2 claim ──────────────────────────────────────────────────────────────
-- THE atomic claim. Eligibility is decided by the database from DATABASE TIME,
-- and the rows are locked with SKIP LOCKED so two concurrent workers receive
-- disjoint sets: a job is never claimed twice while a live lease exists.
--
--   eligible = (queued | retry_wait) and next_attempt_at <= v_now
--              OR claimed with lease_expires_at <= v_now   ← expired-lease recovery
--   and attempt_count < max_attempts
--   where v_now is ONE wall-clock reading taken at the call (clock_timestamp()).
--
-- Recovery is a CLAIM, not an exception path: the recovered job gets a NEW
-- attempt_id, a NEW lease_id, attempt_started_at = v_now, and attempt_count
-- incremented — so the previous attempt's identifiers are permanently fenced out.
--
-- THE LEASE IT GRANTS IS CAPPED AT THE ATTEMPT'S OWN DEADLINE:
--   least(v_now + p_lease_seconds, v_now + max_attempt_seconds)
-- so a caller asking for 900 seconds on a 30-second attempt is granted 30. That cap is
-- also a table invariant (provider_sync_jobs_lease_within_attempt), which is what makes
-- the recovery branch above complete: an attempt that has run out of time has
-- necessarily run out of lease, so nothing can be stranded by the deadline.
create or replace function public.provider_sync_job_claim(
  p_worker_id     text,
  p_limit         integer default 2,
  p_lease_seconds integer default 180
)
returns setof public.provider_sync_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ids uuid[];
  -- READ ONCE, AT THE CALL. Every instant this claim writes or compares comes from
  -- this single wall-clock reading: the eligibility test, the attempt's start, the
  -- lease grant and its cap. One reading means the deadline the lease is capped at is
  -- exactly the deadline the attempt starts under, so a row can never be stored with a
  -- lease even microseconds beyond its own budget.
  --
  -- THIS READING CANNOT GO STALE, and that is a property of the SELECTION below rather
  -- than of this line: candidate rows are taken with FOR UPDATE SKIP LOCKED, which never
  -- waits for another transaction's lock — it skips the row and takes the next — so a
  -- claim pays no lock wait that could age the instant it judges with, and the rows it
  -- then updates are already locked by this same transaction.
  v_now timestamptz := clock_timestamp();
begin
  if p_worker_id is null or length(p_worker_id) < 1 or length(p_worker_id) > 128
     or p_worker_id ~ '[[:cntrl:]]' then
    raise exception 'provider_sync_job_claim: invalid worker identity' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 5 then
    raise exception 'provider_sync_job_claim: claim batch out of bounds (1..5)' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'provider_sync_job_claim: lease seconds out of bounds (30..900)' using errcode = '22023';
  end if;

  select array_agg(c.id) into v_ids
    from (
      select j.id
        from public.provider_sync_jobs j
       where (
               (j.status in ('queued', 'retry_wait') and j.next_attempt_at <= v_now)
               -- expired-lease RECOVERY, on the wall clock. Because a lease is never
               -- granted beyond its attempt's deadline, an attempt that has run out of
               -- time has necessarily run out of lease as well, so this branch is what
               -- keeps an expired attempt recoverable rather than stranded.
               or (j.status = 'claimed' and j.lease_expires_at <= v_now)
             )
         and j.attempt_count < j.max_attempts
       order by j.priority asc, coalesce(j.next_attempt_at, j.created_at) asc, j.created_at asc
       for update skip locked
       limit p_limit
    ) c;

  if v_ids is null then
    return;
  end if;

  return query
    update public.provider_sync_jobs j
       set status              = 'claimed',
           attempt_count       = j.attempt_count + 1,
           attempt_id          = gen_random_uuid(),
           attempt_started_at  = v_now,
           claimed_by          = p_worker_id,
           claimed_at          = v_now,
           lease_id            = gen_random_uuid(),
           -- THE CAP ON THE GRANT. A caller may ask for up to 900 seconds; the
           -- attempt's own budget is the ceiling. The lease therefore can never be the
           -- reason an attempt outlives its deadline, and the row this writes is one
           -- provider_sync_jobs_lease_within_attempt accepts by construction.
           lease_expires_at    = least(
                                   v_now + make_interval(secs => p_lease_seconds),
                                   v_now + make_interval(secs => j.max_attempt_seconds)
                                 ),
           lease_renewal_count = 0,
           next_attempt_at     = null,
           last_error_class    = null,
           last_error_code     = null,
           last_error_message  = null,
           updated_at          = v_now
     where j.id = any(v_ids)
    returning j.*;
end;
$$;

-- ── 4.3 renew_lease ────────────────────────────────────────────────────────
-- Extends a LIVE lease only, and only while the attempt is inside its hard
-- budget. Returns false when the lease was lost — the caller must then stop
-- immediately and commit nothing.
create or replace function public.provider_sync_job_renew_lease(
  p_job_id        uuid,
  p_attempt_id    uuid,
  p_lease_id      uuid,
  p_worker_id     text,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ok  boolean;
  v_job public.provider_sync_jobs;
  -- THE WALL CLOCK, READ AFTER THE ROW LOCK IS HELD — never here. A renewal is a
  -- writer, and the row lock is the one thing it can wait for: an instant captured at
  -- the call could be spent waiting, and would then judge this renewal against time
  -- that had already passed. A renewal that arrived inside its lease but was SERVED
  -- after the lease — or after the attempt's absolute deadline — would extend a claim
  -- that no longer exists. Both the deadline test and the cap on what this renewal
  -- grants are judged against the SAME reading, taken once the row is held.
  v_now timestamptz;
begin
  if p_worker_id is null or length(p_worker_id) < 1 or length(p_worker_id) > 128
     or p_worker_id ~ '[[:cntrl:]]' then
    raise exception 'provider_sync_job_renew_lease: invalid worker identity' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'provider_sync_job_renew_lease: lease seconds out of bounds (30..900)'
      using errcode = '22023';
  end if;

  -- ── 1 · TAKE THE ROW LOCK BEFORE READING ANY TIME ────────────────────────
  -- This is the ONLY statement in this function that can wait, and every fence and cap
  -- below is read AFTER it returns. A renewal that waited for a concurrent ingest or
  -- completion is therefore judged against the instant it actually holds the row: a
  -- lease that lapsed during the wait is refused, and an attempt that left its budget
  -- during the wait is refused, instead of being extended on the time this call
  -- arrived. The UPDATE below still carries the whole fence as its predicate — the
  -- lock makes the reading fresh, and the predicate remains the authority.
  select j.* into v_job
    from public.provider_sync_jobs j
   where j.id = p_job_id
     for update;

  if v_job.id is null then
    return false;
  end if;

  v_now := clock_timestamp();

  update public.provider_sync_jobs j
     -- THE RENEWED LEASE IS CAPPED AT THE ATTEMPT'S DEADLINE, exactly as the grant in
     -- claim() is: renewal can extend the lease up to the budget but never past it.
     set lease_expires_at    = least(
                                 v_now + make_interval(secs => p_lease_seconds),
                                 j.attempt_started_at + make_interval(secs => j.max_attempt_seconds)
                               ),
         lease_renewal_count = j.lease_renewal_count + 1,
         updated_at          = v_now
   where j.id = p_job_id
     and j.status = 'claimed'
     and j.attempt_id = p_attempt_id
     and j.lease_id = p_lease_id
     and j.claimed_by = p_worker_id
     and j.lease_expires_at > v_now
     -- THE ABSOLUTE DEADLINE, REFUSED AT OR AFTER IT. Strict `<`, so the last
     -- admissible renewal is one that begins strictly inside the budget; a renewal at
     -- the exact deadline is already too late. This is what stops a runaway worker
     -- holding a job open by renewing, and it is read from the wall clock so a long
     -- transaction cannot renew past its own budget.
     and v_now < j.attempt_started_at + make_interval(secs => j.max_attempt_seconds)
     -- THE RENEWAL BUDGET, REFUSED RATHER THAN TRIPPED. attempt_bounds caps
     -- lease_renewal_count at 100, so an unguarded +1 on the 101st renewal would
     -- raise a CHECK violation instead of answering false. Past the budget the lease
     -- simply stops being extendable, which the worker already reads as a lost lease
     -- and answers by committing nothing.
     and j.lease_renewal_count < 100
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

-- ── 4.4 complete ───────────────────────────────────────────────────────────
-- The ONLY way a claimed job leaves the claimed state. Fenced on all four
-- identity facts AND on an unexpired lease, so a stale worker cannot mark work
-- done: it matches zero rows and the function reports LEASE_FENCED.
--
-- Returns a text verdict rather than raising, because a worker that has lost its
-- lease must be able to learn that fact without any mutation being attempted.
-- 'NOT_FOUND' | 'LEASE_FENCED' | 'completed' | 'retry_wait' | 'failed'
create or replace function public.provider_sync_job_complete(
  p_job_id          uuid,
  p_attempt_id      uuid,
  p_lease_id        uuid,
  p_worker_id       text,
  p_outcome         text,
  p_error_class     text default null,
  p_error_code      text default null,
  p_error_message   text default null,
  p_backoff_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job     public.provider_sync_jobs;
  v_backoff integer;
begin
  if p_worker_id is null or length(p_worker_id) < 1 or length(p_worker_id) > 128
     or p_worker_id ~ '[[:cntrl:]]' then
    raise exception 'provider_sync_job_complete: invalid worker identity' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('completed', 'retryable', 'failed') then
    raise exception 'provider_sync_job_complete: outcome must be completed, retryable or failed'
      using errcode = '22023';
  end if;
  if p_outcome <> 'completed' then
    if p_error_class is null or p_error_class not in (
         'transient', 'rate_limited', 'timeout', 'provider_error', 'provider_protocol_error',
         'configuration_error', 'permanent', 'lease_lost', 'transient_exhausted'
       ) then
      raise exception 'provider_sync_job_complete: a failed outcome requires a known error class'
        using errcode = '22023';
    end if;
    if p_error_code is not null and (length(p_error_code) > 96 or p_error_code ~ '[[:cntrl:]]') then
      raise exception 'provider_sync_job_complete: error code out of bounds' using errcode = '22023';
    end if;
    if p_error_message is not null and (length(p_error_message) > 512 or p_error_message ~ '[[:cntrl:]]') then
      raise exception 'provider_sync_job_complete: error message out of bounds' using errcode = '22023';
    end if;
  end if;

  -- Lock the row for the whole transition: a completion and an ingest can never
  -- interleave, and the fencing test below reads the same snapshot it writes.
  select j.* into v_job
    from public.provider_sync_jobs j
   where j.id = p_job_id
     for update;

  if v_job.id is null then
    return 'NOT_FOUND';
  end if;
  if v_job.status <> 'claimed'
     or v_job.attempt_id is distinct from p_attempt_id
     or v_job.lease_id is distinct from p_lease_id
     or v_job.claimed_by is distinct from p_worker_id then
    return 'LEASE_FENCED';
  end if;

  -- THE ABSOLUTE DEADLINE, READ AFTER THE ROW LOCK IS HELD. clock_timestamp() is called
  -- here rather than captured before the SELECT ... FOR UPDATE, because a completion
  -- that waited for the lock must be judged against the instant it actually holds the
  -- row. now() — or any instant captured earlier — would let the wait be paid for with
  -- stale time and let a completion that is already out of budget report success.
  if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then
    return 'ATTEMPT_EXPIRED';
  end if;

  if v_job.lease_expires_at <= clock_timestamp() then
    return 'LEASE_FENCED';
  end if;

  if p_outcome = 'completed' then
    update public.provider_sync_jobs j
       set status = 'completed', completed_at = clock_timestamp(),
           lease_id = null, lease_expires_at = null,
           next_attempt_at = null,
           last_error_class = null, last_error_code = null, last_error_message = null,
           updated_at = clock_timestamp()
     where j.id = v_job.id;
    return 'completed';
  end if;

  if p_outcome = 'failed' then
    update public.provider_sync_jobs j
       set status = 'failed',
           lease_id = null, lease_expires_at = null,
           next_attempt_at = null,
           last_error_class = p_error_class,
           last_error_code = coalesce(p_error_code, p_error_class),
           last_error_message = coalesce(p_error_message, 'terminal execution failure'),
           updated_at = clock_timestamp()
     where j.id = v_job.id;
    return 'failed';
  end if;

  -- retryable
  if v_job.attempt_count < v_job.max_attempts then
    v_backoff := least(greatest(coalesce(p_backoff_seconds, 30), 1), 900);
    update public.provider_sync_jobs j
       set status = 'retry_wait',
           -- The retry instant is a SCHEDULE, so it is measured from the wall clock:
           -- a backoff computed from a transaction's start time would shorten as the
           -- transaction grew.
           next_attempt_at = clock_timestamp() + make_interval(secs => v_backoff),
           lease_id = null, lease_expires_at = null,
           last_error_class = p_error_class,
           last_error_code = coalesce(p_error_code, p_error_class),
           last_error_message = coalesce(p_error_message, 'retryable execution failure'),
           updated_at = clock_timestamp()
     where j.id = v_job.id;
    return 'retry_wait';
  end if;

  update public.provider_sync_jobs j
     set status = 'failed',
         lease_id = null, lease_expires_at = null,
         next_attempt_at = null,
         last_error_class = 'transient_exhausted',
         last_error_code = coalesce(p_error_code, 'attempts_exhausted'),
         last_error_message = coalesce(p_error_message, 'attempt budget exhausted'),
         updated_at = clock_timestamp()
   where j.id = v_job.id;
  return 'failed';
end;
$$;

-- ── 4.5 sweep ─────────────────────────────────────────────────────────────
-- Marks jobs that cannot progress as failed: queued/retry_wait jobs whose attempt
-- budget is already spent, and claimed jobs whose budget is spent AND whose lease
-- has lapsed (a live lease is never yanked — that worker may still be working).
-- Bounded, idempotent, and it never selects a job it will not change.
create or replace function public.provider_sync_job_sweep(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ids    uuid[];
  v_marked integer;
  -- The sweep is a DEADLINE reader too: "this attempt can no longer progress" is a
  -- question about the wall clock, so it is asked of the wall clock — and, like the
  -- claim, this reading cannot go stale behind a lock wait: the rows it retires are
  -- taken with FOR UPDATE SKIP LOCKED, so the sweep never waits on another
  -- transaction's lock, and it updates only rows this transaction already holds.
  v_now    timestamptz := clock_timestamp();
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'provider_sync_job_sweep: limit out of bounds (1..500)' using errcode = '22023';
  end if;

  select array_agg(c.id) into v_ids
    from (
      select j.id
        from public.provider_sync_jobs j
       where (
               (j.status in ('queued', 'retry_wait') and j.attempt_count >= j.max_attempts)
               -- A claimed job whose budget is spent is retired once its lease has
               -- lapsed ON THE WALL CLOCK. Because claim() caps every lease at the
               -- attempt's deadline, an attempt that has run out of time has also run
               -- out of lease — so an exhausted attempt is retired here rather than
               -- left holding the job.
               or (j.status = 'claimed' and j.attempt_count >= j.max_attempts
                   and j.lease_expires_at <= v_now)
             )
       order by j.created_at asc
       for update skip locked
       limit p_limit
    ) c;

  if v_ids is null then
    return 0;
  end if;

  update public.provider_sync_jobs j
     set status = 'failed',
         lease_id = null, lease_expires_at = null,
         next_attempt_at = null,
         last_error_class = 'transient_exhausted',
         last_error_code = 'attempts_exhausted',
         last_error_message = 'attempt budget exhausted before a successful execution',
         updated_at = v_now
   where j.id = any(v_ids);
  get diagnostics v_marked = row_count;
  return v_marked;
end;
$$;

-- ── 4.6 authorize (claim verification, in DATABASE TIME) ───────────────────
-- The independent server-side verification §3 requires. It answers exactly one
-- question — "is this caller, right now, the live claim holder of this job?" —
-- using the database's wall clock, the row's own lease, and the row's own attempt
-- identity — and against the attempt's ABSOLUTE deadline. The
-- authoritative facts it returns are what the authorization kernel is then given;
-- the caller supplies no business, connection, provider or operation.
--
-- It is deliberately READ-ONLY. It grants nothing: the decision still comes from
-- the certified kernel, and the audit row is still written by the certified
-- audit writer. This function only establishes WHOSE claim is live.
create or replace function public.provider_sync_job_authorize(
  p_job_id     uuid,
  p_attempt_id uuid,
  p_lease_id   uuid,
  p_worker_id  text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.provider_sync_jobs;
begin
  if p_worker_id is null or length(p_worker_id) < 1 or length(p_worker_id) > 128
     or p_worker_id ~ '[[:cntrl:]]' then
    raise exception 'provider_sync_job_authorize: invalid worker identity' using errcode = '22023';
  end if;

  if p_job_id is null or p_attempt_id is null or p_lease_id is null then
    return jsonb_build_object('verified', false, 'claim_state', 'context_incomplete');
  end if;

  select j.* into v_job from public.provider_sync_jobs j where j.id = p_job_id;
  if v_job.id is null then
    return jsonb_build_object('verified', false, 'claim_state', 'job_not_found');
  end if;

  -- From here on every refusal carries the row's own binding so the audit can
  -- attribute the attempt to a business and a provider it never had to be told.
  if v_job.status <> 'claimed' then
    return jsonb_build_object('verified', false, 'claim_state', 'job_not_claimed',
      'job', jsonb_build_object('id', v_job.id, 'business_id', v_job.business_id,
        'business_connection_id', v_job.business_connection_id, 'credential_id', v_job.credential_id, 'credential_type', v_job.credential_type,
        'provider', v_job.provider, 'provider_operation', v_job.provider_operation,
        'status', v_job.status, 'attempt_count', v_job.attempt_count, 'max_attempts', v_job.max_attempts));
  end if;
  if v_job.attempt_id is distinct from p_attempt_id
     or v_job.lease_id is distinct from p_lease_id
     or v_job.claimed_by is distinct from p_worker_id then
    return jsonb_build_object('verified', false, 'claim_state', 'claim_mismatch',
      'job', jsonb_build_object('id', v_job.id, 'business_id', v_job.business_id,
        'business_connection_id', v_job.business_connection_id, 'credential_id', v_job.credential_id, 'credential_type', v_job.credential_type,
        'provider', v_job.provider, 'provider_operation', v_job.provider_operation,
        'status', v_job.status, 'attempt_count', v_job.attempt_count, 'max_attempts', v_job.max_attempts));
  end if;
  -- THE ABSOLUTE DEADLINE, INDEPENDENT OF THE LEASE. An attempt at or past
  -- attempt_started_at + max_attempt_seconds is over, whatever its lease row says: the
  -- budget bounds the ATTEMPT, and no lease may outlive it. Read from the wall clock at
  -- this call, so a transaction that began before the deadline cannot answer with the
  -- time it began. This refusal is checked separately from the lease, so neither fact
  -- can silently stand in for the other.
  if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then
    return jsonb_build_object('verified', false, 'claim_state', 'attempt_expired',
      'job', jsonb_build_object('id', v_job.id, 'business_id', v_job.business_id,
        'business_connection_id', v_job.business_connection_id, 'credential_id', v_job.credential_id, 'credential_type', v_job.credential_type,
        'provider', v_job.provider, 'provider_operation', v_job.provider_operation,
        'status', v_job.status, 'attempt_count', v_job.attempt_count, 'max_attempts', v_job.max_attempts));
  end if;
  if v_job.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('verified', false, 'claim_state', 'lease_expired',
      'job', jsonb_build_object('id', v_job.id, 'business_id', v_job.business_id,
        'business_connection_id', v_job.business_connection_id, 'credential_id', v_job.credential_id, 'credential_type', v_job.credential_type,
        'provider', v_job.provider, 'provider_operation', v_job.provider_operation,
        'status', v_job.status, 'attempt_count', v_job.attempt_count, 'max_attempts', v_job.max_attempts));
  end if;
  if v_job.attempt_count > v_job.max_attempts then
    return jsonb_build_object('verified', false, 'claim_state', 'attempt_exhausted',
      'job', jsonb_build_object('id', v_job.id, 'business_id', v_job.business_id,
        'business_connection_id', v_job.business_connection_id, 'credential_id', v_job.credential_id, 'credential_type', v_job.credential_type,
        'provider', v_job.provider, 'provider_operation', v_job.provider_operation,
        'status', v_job.status, 'attempt_count', v_job.attempt_count, 'max_attempts', v_job.max_attempts));
  end if;

  return jsonb_build_object(
    'verified', true,
    'claim_state', 'live',
    'job', jsonb_build_object(
      'id', v_job.id,
      'business_id', v_job.business_id,
      'business_connection_id', v_job.business_connection_id,
      'credential_id', v_job.credential_id, 'credential_type', v_job.credential_type,
      'provider', v_job.provider,
      'provider_operation', v_job.provider_operation,
      'status', v_job.status,
      'attempt_id', v_job.attempt_id,
      'lease_id', v_job.lease_id,
      'attempt_count', v_job.attempt_count,
      'max_attempts', v_job.max_attempts,
      'max_attempt_seconds', v_job.max_attempt_seconds,
      'attempt_started_at', v_job.attempt_started_at,
      'lease_expires_at', v_job.lease_expires_at
    )
  );
end;
$$;

-- ── 4.7 ingest (observation ingestion + checkpoint advance, one unit) ──────
-- THE fenced write. One statement block, one transaction, one lock order
-- (job row, then checkpoint row), and no EXCEPTION handler that could swallow a
-- failure into a partial commit:
--
--   1. caller identifiers are validated, never trusted
--   2. the JOB ROW is the authority: locked FOR UPDATE, then tested for
--      status/attempt/lease/worker, for an unexpired lease, AND for an attempt still
--      inside its absolute deadline — all from the wall clock, read AFTER the lock,
--      and the deadline before the lease so an expired attempt can never be mistaken
--      for a superseded claim
--   3. the checkpoint row is locked (or created at version 0) and the advance is
--      validated: kind agreement, CAS on cursor_version, strict monotonicity for
--      an ordered cursor, no ordinal for an opaque one
--   4. every observation is validated against the closed vocabularies and bounds,
--      and its canonical dedup_key and payload_hash are computed ONCE here — so
--      the classification and the row finally stored cannot disagree
--   5. the delivered set is CLASSIFIED before anything is written: a delivery may
--      repeat an earlier one in this batch, repeat a stored one, or CONTRADICT
--      one — and each answer is decided from the delivered elements plus a plain
--      read of COMMITTED rows, never from rows this function is about to insert
--   6. a contradiction — inside the batch or against the store — REFUSES the whole
--      unit here, BEFORE any insert and before any cursor movement
--   7. the absent keys are inserted, one row each, first delivery wins, with NO
--      ON-CONFLICT clause: a unique violation raises OBSERVATION_RACE, never discards
--   8. the checkpoint is advanced by compare-and-swap, AFTER the insert
--   9. the receipt reports delivered / inserted / duplicates / conflicts
--
-- Any failure at any step raises, so the transaction rolls back whole: observations
-- and cursor move together, or neither moves.
--
-- WHY THE CLASSIFICATION SITS BEFORE THE INSERT
--   A statement cannot see the rows it has just written, so counting duplicates and
--   conflicts by re-reading the table inside the statement that inserts the batch
--   would measure the store as it was BEFORE the batch. That is precisely how two
--   deliveries of one page that disagree could pass unnoticed and then be lost
--   behind an advanced cursor. The batch is classified first, from the delivered
--   elements plus committed rows; the refusal follows; only then is anything
--   written.
create or replace function public.provider_sync_observation_ingest(
  p_job_id       uuid,
  p_attempt_id   uuid,
  p_lease_id     uuid,
  p_worker_id    text,
  p_observations jsonb,
  p_checkpoint   jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job            public.provider_sync_jobs;
  -- THE WALL CLOCK, captured immediately AFTER the job row is locked — never before,
  -- because acquiring that lock is precisely what may have made this unit wait — and
  -- RE-READ at the mutation boundary, because the wait that follows (the per-key
  -- advisory locks of 4d) cannot be paid for with a reading taken before it.
  v_now            timestamptz;
  v_count          integer;
  v_elem           jsonb;
  v_obj_type       text;
  v_obj_id         text;
  v_value_kind     text;
  v_source_version text;
  v_dedup          text;
  v_dedup_expected text;

  -- the delivered set, fingerprinted ONCE: element, canonical key, payload hash
  v_keys           text[] := array[]::text[];
  v_hashes         text[] := array[]::text[];
  v_elems          jsonb[] := array[]::jsonb[];

  v_delivered_count integer := 0;
  v_absent_keys    integer := 0;
  v_lock_key       bigint;
  v_inserted       integer := 0;
  v_duplicates     integer := 0;
  v_conflicts      integer := 0;
  v_last_id        uuid := null;
  v_batch_id       uuid := gen_random_uuid();
  v_active_credential_id uuid := null;

  v_scope          text;
  v_kind           text;
  v_expected       bigint;
  v_new_version    bigint := null;
  v_ordinal_text   text;
  v_ordinal        numeric := null;
  v_token          text := null;
  v_cp             public.provider_sync_checkpoints;
  v_updated        integer;
begin
  -- ── 1 · caller-supplied identifiers: validated, never trusted ────────────
  if p_worker_id is null or length(p_worker_id) < 1 or length(p_worker_id) > 128
     or p_worker_id ~ '[[:cntrl:]]' then
    raise exception 'provider_sync_observation_ingest: invalid worker identity' using errcode = '22023';
  end if;
  if p_observations is null or jsonb_typeof(p_observations) <> 'array' then
    raise exception 'provider_sync_observation_ingest: observations must be a JSON array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_observations);
  if v_count > 500 then
    raise exception 'provider_sync_observation_ingest: batch exceeds the 500 observation bound'
      using errcode = '22023';
  end if;
  if length(p_observations::text) > 2097152 then
    raise exception 'provider_sync_observation_ingest: batch exceeds the 2 MiB byte bound'
      using errcode = '22023';
  end if;

  -- ── 2 · THE FENCE — the job row is the authority, locked for the whole unit ─
  select j.* into v_job
    from public.provider_sync_jobs j
   where j.id = p_job_id
     for update;

  -- Read the clock only once the lock is HELD. A time captured before the lock (or
  -- now(), which is the transaction's start) would let the wait itself be paid for with
  -- time that has already passed, and a unit that waited past its deadline could still
  -- present itself as inside it.
  v_now := clock_timestamp();

  if v_job.id is null then
    raise exception 'provider_sync_observation_ingest: LEASE_FENCED (job_not_found)'
      using errcode = 'P0001';
  end if;
  if v_job.status <> 'claimed' then
    raise exception 'provider_sync_observation_ingest: LEASE_FENCED (job_not_claimed)'
      using errcode = 'P0001';
  end if;
  if v_job.attempt_id is distinct from p_attempt_id
     or v_job.lease_id is distinct from p_lease_id
     or v_job.claimed_by is distinct from p_worker_id then
    raise exception 'provider_sync_observation_ingest: LEASE_FENCED (claim_mismatch)'
      using errcode = 'P0001';
  end if;
  -- THE ABSOLUTE DEADLINE, BEFORE ANY MUTATION. The checks above answer "is this the
  -- live claim holder of a claimed job?"; this answers "is this attempt still allowed to
  -- run at all?" — and it is asked before the checkpoint row is touched, before any
  -- observation is validated, and before any lock is taken. Independent of the lease,
  -- because the budget bounds the ATTEMPT and no lease may outlive it
  -- (provider_sync_jobs_lease_within_attempt): a row whose lease still reads live is
  -- still refused once its deadline has passed.
  if v_now >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then
    raise exception 'provider_sync_observation_ingest: ATTEMPT_EXPIRED (the attempt passed its absolute deadline of % seconds; nothing is written)', v_job.max_attempt_seconds
      using errcode = 'P0001';
  end if;
  if v_job.lease_expires_at <= v_now then
    raise exception 'provider_sync_observation_ingest: LEASE_FENCED (lease_expired)'
      using errcode = 'P0001';
  end if;

  -- The credential that actually produced this evidence: the CURRENT active
  -- credential of the job's rotation unit, read HERE rather than supplied by the
  -- worker (§5 — authoritative database values beat worker-submitted identifiers).
  -- A rotation mid-page is normal and simply yields the successor's id; a revoked
  -- unit leaves this null, and the row stays fenced to job + attempt + lease.
  select c.id into v_active_credential_id
    from public.provider_credentials c
   where c.business_id = v_job.business_id
     and c.business_connection_id = v_job.business_connection_id
     and c.credential_type = v_job.credential_type
     and c.status = 'active'
   limit 1;

  -- ── 3 · checkpoint: lock, initialize, validate the advance BEFORE writing ──
  if p_checkpoint is not null then
    if jsonb_typeof(p_checkpoint) <> 'object' then
      raise exception 'provider_sync_observation_ingest: checkpoint must be a JSON object'
        using errcode = '22023';
    end if;
    v_scope := p_checkpoint->>'scope';
    if v_scope is null
       or v_scope !~ '^(accounts|balances|transactions|statement|invoices|journal)(:[A-Za-z0-9_.-]{1,64}){0,2}$' then
      raise exception 'provider_sync_observation_ingest: checkpoint scope is not a bounded known scope'
        using errcode = '22023';
    end if;
    v_kind := p_checkpoint->>'cursor_kind';
    if v_kind is null or v_kind not in ('ordered', 'opaque') then
      raise exception 'provider_sync_observation_ingest: cursor_kind must be ordered or opaque'
        using errcode = '22023';
    end if;
    if not (p_checkpoint ? 'expected_version')
       or (p_checkpoint->>'expected_version') !~ '^[0-9]{1,12}$' then
      raise exception 'provider_sync_observation_ingest: expected_version is REQUIRED for a checkpoint advance (compare-and-swap)'
        using errcode = '22023';
    end if;
    v_expected := (p_checkpoint->>'expected_version')::bigint;

    select c.* into v_cp
      from public.provider_sync_checkpoints c
     where c.job_id = v_job.id and c.checkpoint_scope = v_scope
       for update;

    if v_cp.id is null then
      if v_expected <> 0 then
        raise exception 'provider_sync_observation_ingest: CHECKPOINT_STALE (no checkpoint exists; the first advance must declare expected_version 0)'
          using errcode = 'P0001';
      end if;
      insert into public.provider_sync_checkpoints (
        business_id, business_connection_id, job_id, checkpoint_scope, cursor_kind, cursor_version
      ) values (
        v_job.business_id, v_job.business_connection_id, v_job.id, v_scope, v_kind, 0
      )
      on conflict (job_id, checkpoint_scope) do nothing;

      select c.* into v_cp
        from public.provider_sync_checkpoints c
       where c.job_id = v_job.id and c.checkpoint_scope = v_scope
         for update;
      if v_cp.id is null then
        raise exception 'provider_sync_observation_ingest: CHECKPOINT_STALE (concurrent initialization)'
          using errcode = 'P0001';
      end if;
    end if;

    if v_cp.cursor_kind <> v_kind then
      raise exception 'provider_sync_observation_ingest: CHECKPOINT_KIND_MISMATCH (the scope''s cursor kind is immutable)'
        using errcode = 'P0001';
    end if;
    if v_cp.cursor_version <> v_expected then
      raise exception 'provider_sync_observation_ingest: CHECKPOINT_STALE (expected_version does not match the committed cursor version)'
        using errcode = 'P0001';
    end if;

    if v_kind = 'ordered' then
      v_ordinal_text := p_checkpoint->>'cursor_ordinal';
      if v_ordinal_text is null or v_ordinal_text !~ '^[0-9]{1,15}(\.[0-9]{1,6})?$' then
        raise exception 'provider_sync_observation_ingest: an ordered checkpoint requires a non-negative numeric cursor_ordinal'
          using errcode = '22023';
      end if;
      v_ordinal := v_ordinal_text::numeric;
      if (p_checkpoint ? 'cursor_token') and (p_checkpoint->>'cursor_token') is not null then
        raise exception 'provider_sync_observation_ingest: an ordered checkpoint must not carry a cursor_token'
          using errcode = '22023';
      end if;
      if v_cp.cursor_ordinal is not null and not (v_ordinal > v_cp.cursor_ordinal) then
        raise exception 'provider_sync_observation_ingest: CHECKPOINT_NOT_MONOTONIC (an ordered cursor only moves forward)'
          using errcode = 'P0001';
      end if;
      v_token := null;
    else
      v_token := p_checkpoint->>'cursor_token';
      if v_token is null or length(v_token) < 1 or length(v_token) > 4096
         or v_token ~ '[[:cntrl:]]' then
        raise exception 'provider_sync_observation_ingest: an opaque checkpoint requires a bounded cursor_token'
          using errcode = '22023';
      end if;
      if (p_checkpoint ? 'cursor_ordinal') and (p_checkpoint->>'cursor_ordinal') is not null then
        raise exception 'provider_sync_observation_ingest: an opaque checkpoint must not carry a cursor_ordinal'
          using errcode = '22023';
      end if;
      v_ordinal := null;
    end if;
  end if;

  -- ── 4 · per-element validation (fail before writing anything) ────────────
  for v_elem in select value from jsonb_array_elements(p_observations) as t(value) loop
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'provider_sync_observation_ingest: every observation must be an object'
        using errcode = '22023';
    end if;
    v_obj_type := v_elem->>'object_type';
    v_obj_id := v_elem->>'provider_object_id';
    v_value_kind := v_elem->>'value_kind';
    v_source_version := v_elem->>'source_version';

    if v_obj_type is null or v_obj_type not in (
         'account', 'balance', 'transaction', 'journal_entry', 'invoice', 'payment',
         'bill', 'payout', 'contact', 'vendor', 'customer', 'category', 'statement', 'other') then
      raise exception 'provider_sync_observation_ingest: unsupported object_type' using errcode = '22023';
    end if;
    if v_value_kind is null or v_value_kind not in (
         'amount', 'currency', 'balance', 'quantity', 'rate', 'status', 'date',
         'period', 'description', 'identifier', 'text', 'reference', 'json') then
      raise exception 'provider_sync_observation_ingest: unsupported value_kind' using errcode = '22023';
    end if;
    if v_obj_id is null or length(v_obj_id) < 1 or length(v_obj_id) > 256
       or v_obj_id ~ '[[:cntrl:]]' then
      raise exception 'provider_sync_observation_ingest: provider_object_id out of bounds'
        using errcode = '22023';
    end if;
    if v_source_version is null or length(v_source_version) < 1 or length(v_source_version) > 256
       or v_source_version ~ '[[:cntrl:]]' then
      raise exception 'provider_sync_observation_ingest: source_version out of bounds'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_elem->'payload') <> 'object' then
      raise exception 'provider_sync_observation_ingest: every observation requires an object payload'
        using errcode = '22023';
    end if;
    if length((v_elem->'payload')::text) > 16384 then
      raise exception 'provider_sync_observation_ingest: observation payload exceeds the 16 KiB bound'
        using errcode = '22023';
    end if;
    if (v_elem ? 'source_updated_at') and (v_elem->>'source_updated_at') is not null
       and (v_elem->>'source_updated_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then
      raise exception 'provider_sync_observation_ingest: source_updated_at must be an ISO-8601 timestamp'
        using errcode = '22023';
    end if;

    -- The canonical key is computed HERE, from the job row plus the semantic
    -- identity. A caller-supplied candidate is a drift tripwire only: it is never
    -- the value used, and a mismatch fails the whole batch loudly.
    v_dedup_expected := encode(sha256(convert_to(
      v_job.business_id::text || '|' || v_job.provider || '|' || v_job.business_connection_id::text || '|' ||
      v_obj_type || '|' || v_obj_id || '|' || v_value_kind || '|' || v_source_version, 'utf8')), 'hex');
    if (v_elem ? 'dedup_key') then
      v_dedup := coalesce(v_elem->>'dedup_key', '');
      if v_dedup <> v_dedup_expected then
        raise exception 'provider_sync_observation_ingest: DEDUP_KEY_MISMATCH (the canonical key is computed by the database; a candidate must be byte-identical)'
          using errcode = '22023';
      end if;
    end if;

    -- Keep the validated element beside the two fingerprints computed ONCE, so the
    -- classification below and the insert further down cannot drift apart: neither
    -- re-derives the key and neither re-derives the payload hash.
    v_keys   := v_keys   || v_dedup_expected;
    v_hashes := v_hashes || encode(sha256(convert_to((v_elem->'payload')::text, 'utf8')), 'hex');
    v_elems  := v_elems  || v_elem;
  end loop;

  -- ── 4d · SERIALIZE EVERY WRITER OF THESE KEYS, ACROSS JOBS ──────────────
  -- The job-row lock above serializes the writers of ONE job. It does not serialize
  -- two DIFFERENT jobs (two operations on one connection, or a recovered job beside
  -- its successor), and the dedup key names neither the job nor the operation, so
  -- two such writers can deliver the same key at the same moment. Unserialized, both
  -- would classify the key as absent (neither sees the other's uncommitted row), the
  -- second insert would wait on the unique index, and when the first committed the
  -- second would either discard its payload or fail, with a receipt describing a
  -- store that does not exist.
  --
  -- A TRANSACTION-SCOPED advisory lock per key closes the window. It is held until
  -- this transaction commits or rolls back, so a second writer of the same key waits
  -- HERE, before it classifies; and because each statement of a READ COMMITTED
  -- function takes a fresh snapshot, its classification below then sees the first
  -- writer's COMMITTED row: identical payload, a duplicate; different payload, the
  -- conflict refusal of 5b; first writer rolled back, absent and inserted here.
  --
  -- Locks are taken in ascending LOCK-ID order, never key order: a 64-bit hash can
  -- collide, and ordering by the value actually locked is what makes two writers
  -- with overlapping key sets unable to wait on each other in a cycle. A collision
  -- only ever serializes two unrelated keys; it can never admit two writers of one.
  -- The set is bounded by the batch bound above (at most 500 distinct keys).
  for v_lock_key in
    select distinct hashtextextended('cb005b:provider_observations:dedup_key:' || k, 0)
      from unnest(v_keys) as k
     order by 1
  loop
    perform pg_advisory_xact_lock(v_lock_key);
  end loop;

  -- ── 5 · CLASSIFY the delivered set, BEFORE anything is written ───────────
  -- Every count below is derived from the delivered elements held in memory plus a
  -- plain read of COMMITTED rows. Nothing here reads a row this function is about
  -- to insert, because nothing has been inserted yet: the INSERT below is a
  -- standalone statement that follows the refusal, not a data-modifying CTE whose
  -- own effects the main query would have to see. Both fingerprints were computed
  -- ONCE, in the validation loop above, so the classification and the row finally
  -- stored cannot disagree about which key, or which payload, they describe.
  with delivered as (
    select e.ord,
           e.key  as dedup_key,
           e.hash as payload_hash
      from unnest(v_keys, v_hashes, v_elems) with ordinality as e(key, hash, elem, ord)
  ),
  key_delivery as (
    select dedup_key,
           (array_agg(payload_hash order by ord))[1] as first_hash,
           count(*)::int as delivered_count,
           -- CONTRADICTED WITHIN THE BATCH: one dedup_key delivered with more than
           -- one payload_hash. ON CONFLICT DO NOTHING would otherwise keep the first
           -- delivery and drop the second without a word.
           (count(distinct payload_hash) > 1) as contradicts_itself
      from delivered
     group by dedup_key
  ),
  key_state as (
    select k.dedup_key, k.first_hash, k.delivered_count, k.contradicts_itself,
           po.payload_hash as stored_hash
      from key_delivery k
      left join public.provider_observations po on po.dedup_key = k.dedup_key
  )
  select
    -- deliveries that contradict another delivery of the same key in this batch
    coalesce(sum(delivered_count - 1) filter (where contradicts_itself), 0)::int
      -- and deliveries that contradict what the store already holds for that key
      + coalesce(sum(delivered_count) filter (
          where not contradicts_itself and stored_hash is not null and stored_hash <> first_hash
        ), 0)::int,
    -- identical repeats inside the batch, plus identical re-deliveries of a stored row
    coalesce(sum(delivered_count - 1) filter (
        where not contradicts_itself and stored_hash is null
      ), 0)::int
      + coalesce(sum(delivered_count) filter (
          where not contradicts_itself and stored_hash = first_hash
        ), 0)::int,
    -- the keys this unit must actually insert: delivered, uncontradicted, not stored
    (count(*) filter (where not contradicts_itself and stored_hash is null))::int,
    -- DELIVERIES, not keys: a batch [K, K] is two deliveries (one inserted, one
    -- duplicate), so delivered = inserted + duplicates + conflicts holds per delivery.
    coalesce(sum(delivered_count), 0)::int
    into v_conflicts, v_duplicates, v_absent_keys, v_delivered_count
    from key_state;

  -- ── 5b · A CONFLICT IS A REFUSAL, NEVER A SILENT SKIP ────────────────────
  -- A delivered observation whose dedup_key already carries a DIFFERENT payload_hash
  -- cannot be stored (the evidence row is immutable) and is not a new identity (the
  -- key already names the version it belongs to, so a second payload for it is a
  -- contradiction rather than a second version). It is therefore the ONE outcome
  -- that must never be quietly absorbed: no insert may store it, and advancing the
  -- cursor past it would make that loss PERMANENT AND INVISIBLE, because no later
  -- run would ever re-fetch a page the cursor has passed.
  --
  -- "Already carries" names BOTH sources, and the message below keeps the phase's
  -- vocabulary for both: a row the store already holds, and an earlier delivery of
  -- this same batch — the delivery that would otherwise have been stored first. The
  -- unit is refused WHOLE, and the refusal is raised HERE, before the insert below,
  -- so the transaction has nothing of its own to roll back: no observation, no
  -- cursor movement, and the job stays claimed for a bounded retry that re-fetches
  -- the same page. A job that keeps meeting the contradiction exhausts its attempt
  -- budget and goes terminal through complete()/sweep(): loud and bounded, never a
  -- silent gap in the evidence store.
  if v_conflicts > 0 then
    raise exception 'provider_sync_observation_ingest: OBSERVATION_CONFLICT (% delivered observation(s) carry a different payload for a dedup_key that is already stored; the stored evidence is immutable, so the batch is refused rather than silently skipped)', v_conflicts
      using errcode = 'P0001';
  end if;

  -- ── 5c · INSERT the absent keys: one row each, first delivery wins ────────
  -- NO ON-CONFLICT CLAUSE, DELIBERATELY. Under the per-key locks of 4d, a key this
  -- unit classified as absent cannot be taken by another writer before this
  -- statement runs, so a unique violation here is not a duplicate to absorb: it is
  -- evidence the serialization was bypassed (for example a caller running this
  -- function at REPEATABLE READ, whose snapshot predates the lock). It therefore
  -- RAISES and rolls the whole unit back. Discarding it instead is exactly how a
  -- conflicting payload would be lost in silence. The repository reports it as the
  -- closed, retryable code OBSERVATION_RACE; the retry runs in a fresh transaction
  -- and classifies against the committed row.
  -- ── 5b-2 · THE WHOLE FENCE IS RE-ASKED AT THE MUTATION BOUNDARY ──────────
  -- THE PROBLEM. The fence at step 2 judged this unit as it arrived. Since then the unit
  -- has waited for the per-key advisory locks of step 4d, and that wait is unbounded in
  -- principle: it lasts as long as another writer of the same keys holds them, which on
  -- a busy connection is exactly when the lease is tightest. A lease that was LIVE on
  -- arrival can therefore have lapsed by the time the unit is ready to write, and a long
  -- transaction must not be able to pay for that wait with time it no longer has.
  --
  -- WHAT THE JOB-ROW LOCK DOES, AND WHAT IT CANNOT DO. This transaction has held the job
  -- row (FOR UPDATE, step 2) continuously through that wait, so no other transaction can
  -- have touched it: the attempt, the lease, the worker and the lease's own expiry
  -- instant are still the values step 2 read, and the row stays locked until this unit
  -- commits or rolls back. What the lock CANNOT freeze is TIME. `lease_expires_at` names
  -- an instant, and that instant passes whether or not anyone runs a statement: the row
  -- lock stops the lease being EXTENDED behind this unit's back, and only a fresh clock
  -- stops the unit OUTLIVING it. So all three facts are re-asked here — the identity,
  -- re-read from the row as it stands (so the verdict is computed at this point rather
  -- than from a reading taken hundreds of lines earlier), the attempt's absolute
  -- deadline, and the lease expiry, the last two against a clock read from the DATABASE
  -- at this instant, after every lock and immediately before the one statement that
  -- writes evidence.
  --
  -- Every refusal RAISES, so the unit rolls back whole: no observation, no checkpoint
  -- row, no cursor movement. Nothing is lost by refusing, because the cursor never moved
  -- past the page, so the next claim re-fetches it; a job whose attempt is genuinely
  -- over is retired through complete()/sweep() — loud and bounded, never a silent gap.
  v_now := clock_timestamp();

  select j.* into v_job
    from public.provider_sync_jobs j
   where j.id = p_job_id;
  if v_job.id is null
     or v_job.status <> 'claimed'
     or v_job.attempt_id is distinct from p_attempt_id
     or v_job.lease_id is distinct from p_lease_id
     or v_job.claimed_by is distinct from p_worker_id then
    raise exception 'provider_sync_observation_ingest: LEASE_FENCED (claim_mismatch after the key wait)'
      using errcode = 'P0001';
  end if;
  if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then
    raise exception 'provider_sync_observation_ingest: ATTEMPT_EXPIRED (the attempt passed its absolute deadline while the unit waited for its keys; nothing is written)'
      using errcode = 'P0001';
  end if;
  if v_now >= v_job.lease_expires_at then
    raise exception 'provider_sync_observation_ingest: LEASE_FENCED (lease_expired while the unit waited for its keys)'
      using errcode = 'P0001';
  end if;

  if v_absent_keys > 0 then
    with ins as (
      insert into public.provider_observations (
        business_id, business_connection_id, credential_id, job_id, attempt_id, lease_id,
        provider, provider_operation, object_type, provider_object_id, value_kind, source_version,
        source_updated_at, payload, payload_hash, dedup_key
      )
      select distinct on (e.key)
             v_job.business_id, v_job.business_connection_id, v_active_credential_id,
             v_job.id, p_attempt_id, p_lease_id,
             v_job.provider, v_job.provider_operation,
             e.elem->>'object_type', e.elem->>'provider_object_id',
             e.elem->>'value_kind', e.elem->>'source_version',
             case when (e.elem ? 'source_updated_at') and (e.elem->>'source_updated_at') is not null
                  then (e.elem->>'source_updated_at')::timestamptz else null end,
             e.elem->'payload', e.hash, e.key
        from unnest(v_keys, v_hashes, v_elems) with ordinality as e(key, hash, elem, ord)
       where not exists (
               select 1 from public.provider_observations po where po.dedup_key = e.key
             )
       order by e.key, e.ord
      returning id, dedup_key
    )
    select (select count(*)::int from ins),
           (select (array_agg(i.id order by i.dedup_key desc))[1] from ins i)
      into v_inserted, v_last_id;
  end if;

  -- ── 5d · THE RECEIPT MUST DESCRIBE THE STORE ────────────────────────────
  -- Every delivery is accounted for exactly once, and every key classified absent
  -- was inserted by THIS unit. Under the locks of 4d both hold by construction;
  -- asserting them here, before any cursor can move, means a receipt that does not
  -- match the store is refused rather than returned.
  if v_inserted <> v_absent_keys
     or v_delivered_count <> v_count
     or v_inserted + v_duplicates + v_conflicts <> v_delivered_count then
    raise exception 'provider_sync_observation_ingest: OBSERVATION_RACE (receipt does not reconcile: delivered %, classified absent %, inserted %, duplicates %, conflicts %; the unit is refused)',
      v_count, v_absent_keys, v_inserted, v_duplicates, v_conflicts
      using errcode = '40001';
  end if;

  -- ── 6 · checkpoint advance: AFTER the insert, in the same transaction ────
  if p_checkpoint is not null then
    update public.provider_sync_checkpoints c
       set cursor_version      = c.cursor_version + 1,
           cursor_ordinal      = coalesce(v_ordinal, c.cursor_ordinal),
           cursor_token        = case when v_kind = 'opaque' then v_token else null end,
           last_batch_id       = v_batch_id,
           last_observation_id = v_last_id,
           last_attempt_id     = p_attempt_id,
           last_lease_id       = p_lease_id,
           last_advanced_at    = clock_timestamp(),
           updated_at          = clock_timestamp()
     where c.id = v_cp.id
       and c.cursor_version = v_expected;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'provider_sync_observation_ingest: CHECKPOINT_STALE (compare-and-swap lost)'
        using errcode = 'P0001';
    end if;
    v_new_version := v_expected + 1;
  end if;

  -- ── 7 · the receipt ─────────────────────────────────────────────────────
  return jsonb_build_object(
    'job_id', v_job.id,
    'attempt_id', v_job.attempt_id,
    'attempt_count', v_job.attempt_count,
    'batch_id', v_batch_id,
    'delivered', v_delivered_count,
    'inserted', v_inserted,
    'duplicates', v_duplicates,
    -- Always 0 in a receipt that exists at all: a non-zero conflict count refuses
    -- the whole unit BEFORE anything is written, so no caller can ever observe one.
    -- The field stays in the contract rather than silently disappearing, and the
    -- three counts reconcile: delivered = inserted + duplicates + conflicts.
    'conflicts', v_conflicts,
    'last_observation_id', v_last_id,
    'checkpoint', case when p_checkpoint is null then null else jsonb_build_object(
      'scope', v_scope,
      'cursor_kind', v_kind,
      'cursor_version', v_new_version,
      'last_batch_id', v_batch_id
    ) end
  );
end;
$$;

-- ── function ownership: pinned to the database owner, never the caller ─────
alter function public.provider_sync_job_enqueue(uuid, uuid, uuid, text, text, integer, integer, integer) owner to postgres;
alter function public.provider_sync_job_claim(text, integer, integer) owner to postgres;
alter function public.provider_sync_job_renew_lease(uuid, uuid, uuid, text, integer) owner to postgres;
alter function public.provider_sync_job_complete(uuid, uuid, uuid, text, text, text, text, text, integer) owner to postgres;
alter function public.provider_sync_job_sweep(integer) owner to postgres;
alter function public.provider_sync_job_authorize(uuid, uuid, uuid, text) owner to postgres;
alter function public.provider_sync_observation_ingest(uuid, uuid, uuid, text, jsonb, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════════════════════
-- 5 · ACCESS CONTROL — explicit, in both directions
--
-- REVOKE before GRANT, per role, service_role INCLUDED: the SEC-031 pg_default_acl
-- trap (anon/authenticated auto-granted DML on new tables) is defeated by hand
-- rather than inherited. The REVOKE also removes the arwdDxtm default that the
-- CB-001 live audit exposed.
--
-- service_role gets SELECT and NOTHING ELSE on all three tables. Every mutation
-- goes through a function that fences, validates and bounds it, so there is no
-- privileged path that bypasses the state machine — including for the role the
-- application itself holds.
-- ============================================================================

alter table public.provider_sync_jobs enable row level security;
alter table public.provider_sync_checkpoints enable row level security;
alter table public.provider_observations enable row level security;

revoke all on table public.provider_sync_jobs from public;
revoke all on table public.provider_sync_jobs from anon;
revoke all on table public.provider_sync_jobs from authenticated;
revoke all on table public.provider_sync_jobs from service_role;
grant select on table public.provider_sync_jobs to service_role;

revoke all on table public.provider_sync_checkpoints from public;
revoke all on table public.provider_sync_checkpoints from anon;
revoke all on table public.provider_sync_checkpoints from authenticated;
revoke all on table public.provider_sync_checkpoints from service_role;
grant select on table public.provider_sync_checkpoints to service_role;

revoke all on table public.provider_observations from public;
revoke all on table public.provider_observations from anon;
revoke all on table public.provider_observations from authenticated;
revoke all on table public.provider_observations from service_role;
grant select on table public.provider_observations to service_role;

-- RLS is on and no browser role holds a table privilege, so these policies exist
-- for exactly one reason: to make the SERVER read path independent of whether the
-- service_role attribute happens to carry BYPASSRLS. They are SELECT-only and
-- service_role-only; anon and authenticated cannot reach these tables at all, and
-- no policy exists that would let any role write.
create policy provider_sync_jobs_service_role_select
  on public.provider_sync_jobs for select to service_role using (true);
create policy provider_sync_checkpoints_service_role_select
  on public.provider_sync_checkpoints for select to service_role using (true);
create policy provider_observations_service_role_select
  on public.provider_observations for select to service_role using (true);

revoke all on function public.provider_sync_job_enqueue(uuid, uuid, uuid, text, text, integer, integer, integer) from public;
revoke all on function public.provider_sync_job_enqueue(uuid, uuid, uuid, text, text, integer, integer, integer) from anon;
revoke all on function public.provider_sync_job_enqueue(uuid, uuid, uuid, text, text, integer, integer, integer) from authenticated;
revoke all on function public.provider_sync_job_enqueue(uuid, uuid, uuid, text, text, integer, integer, integer) from service_role;
grant execute on function public.provider_sync_job_enqueue(uuid, uuid, uuid, text, text, integer, integer, integer) to service_role;

revoke all on function public.provider_sync_job_claim(text, integer, integer) from public;
revoke all on function public.provider_sync_job_claim(text, integer, integer) from anon;
revoke all on function public.provider_sync_job_claim(text, integer, integer) from authenticated;
revoke all on function public.provider_sync_job_claim(text, integer, integer) from service_role;
grant execute on function public.provider_sync_job_claim(text, integer, integer) to service_role;

revoke all on function public.provider_sync_job_renew_lease(uuid, uuid, uuid, text, integer) from public;
revoke all on function public.provider_sync_job_renew_lease(uuid, uuid, uuid, text, integer) from anon;
revoke all on function public.provider_sync_job_renew_lease(uuid, uuid, uuid, text, integer) from authenticated;
revoke all on function public.provider_sync_job_renew_lease(uuid, uuid, uuid, text, integer) from service_role;
grant execute on function public.provider_sync_job_renew_lease(uuid, uuid, uuid, text, integer) to service_role;

revoke all on function public.provider_sync_job_complete(uuid, uuid, uuid, text, text, text, text, text, integer) from public;
revoke all on function public.provider_sync_job_complete(uuid, uuid, uuid, text, text, text, text, text, integer) from anon;
revoke all on function public.provider_sync_job_complete(uuid, uuid, uuid, text, text, text, text, text, integer) from authenticated;
revoke all on function public.provider_sync_job_complete(uuid, uuid, uuid, text, text, text, text, text, integer) from service_role;
grant execute on function public.provider_sync_job_complete(uuid, uuid, uuid, text, text, text, text, text, integer) to service_role;

revoke all on function public.provider_sync_job_sweep(integer) from public;
revoke all on function public.provider_sync_job_sweep(integer) from anon;
revoke all on function public.provider_sync_job_sweep(integer) from authenticated;
revoke all on function public.provider_sync_job_sweep(integer) from service_role;
grant execute on function public.provider_sync_job_sweep(integer) to service_role;

revoke all on function public.provider_sync_job_authorize(uuid, uuid, uuid, text) from public;
revoke all on function public.provider_sync_job_authorize(uuid, uuid, uuid, text) from anon;
revoke all on function public.provider_sync_job_authorize(uuid, uuid, uuid, text) from authenticated;
revoke all on function public.provider_sync_job_authorize(uuid, uuid, uuid, text) from service_role;
grant execute on function public.provider_sync_job_authorize(uuid, uuid, uuid, text) to service_role;

revoke all on function public.provider_sync_observation_ingest(uuid, uuid, uuid, text, jsonb, jsonb) from public;
revoke all on function public.provider_sync_observation_ingest(uuid, uuid, uuid, text, jsonb, jsonb) from anon;
revoke all on function public.provider_sync_observation_ingest(uuid, uuid, uuid, text, jsonb, jsonb) from authenticated;
revoke all on function public.provider_sync_observation_ingest(uuid, uuid, uuid, text, jsonb, jsonb) from service_role;
grant execute on function public.provider_sync_observation_ingest(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- POST-DEPLOYMENT PROBES (read-only; see the companion _verification.sql)
--   1. all three tables exist with 0 rows and the expected constraints
--   2. anon and authenticated hold NO privilege on any of them
--   3. service_role holds SELECT and no write privilege on any of them
--   4. all seven functions are SECURITY DEFINER, owned by postgres,
--      search_path-pinned, and EXECUTE-granted to service_role only
--   5. business_facts / business_fact_evidence / business_fact_conflicts = 0
-- ============================================================================