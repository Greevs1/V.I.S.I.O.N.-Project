-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-002 — VAULT CREDENTIAL WRAPPERS
-- ============================================================================
-- The SMALLEST possible bridge that lets the controlled backend reach Supabase
-- Vault. Vault lives in a private schema that PostgREST does not expose, so
-- without this bridge a Deno backend function cannot create, resolve or destroy
-- credential material at all. Four public functions are that bridge.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   • No real credential. No provider API call. No provider connection.
--   • NO write to business_facts / business_fact_evidence / business_fact_conflicts.
--     The Digital Twin fact freeze remains in force.
--   • No table, view, trigger, policy, index or sequence. No new relation exists,
--     so the SEC-031 pg_default_acl trap is NOT re-armed on any relation. The trap
--     DOES apply to functions (PostgreSQL grants EXECUTE on a new function to
--     PUBLIC), and that is defeated explicitly below.
--   • No change to any CB-001 / CB-001.1 ACL. No table privilege is granted or
--     revoked here: the wrappers do not need one, because they execute as their
--     owner and the caller needs only EXECUTE on the function.
--   • No Base44 shared Supabase connector. No runtime use of it, ever.
--
-- ── WHY A DATABASE WRAPPER AT ALL (the constraint that forces this design) ────
--   supabase-js speaks PostgREST. The `vault` schema is not exposed through
--   PostgREST, so a Deno function cannot call vault.create_secret or read
--   vault.decrypted_secrets. A direct Postgres connection from the edge runtime is
--   not available either. The ONLY path is a public function that PostgREST can
--   expose as an RPC and that internally runs with the privilege to touch Vault.
--
-- ── THE AUTHORIZATION MODEL — STATE IT PLAINLY, BECAUSE IT BOUNDS THIS FILE ───
--   SERVICE ROLE IS CAPABILITY, NOT AUTHORIZATION.
--   An RPC executes as service_role. The database therefore CANNOT see which
--   human asked. These wrappers enforce STRUCTURAL binding — the credential must
--   belong to the stated business AND the stated connection, and must be in a
--   resolvable state. They DO NOT and CANNOT authorize an actor.
--
--   The caller's obligation is the existing Security Kernel sequence, unchanged:
--       authenticateActor() -> authorizeBusinessAccess() -> resolve the connection
--       server-side -> only then call a wrapper.
--   business_id and business_connection_id must be read from the persisted
--   connection row, NEVER from a browser request body. The actor.ts module already
--   states the rule this inherits: never REQUEST BODY -> SERVICE ROLE -> DATABASE.
--
-- ── THE FOUR FUNCTIONS, AND WHY EACH IS NECESSARY ────────────────────────────
--   1. provider_credential_put      REQUIRED — only path that can create Vault
--      material together with its row, atomically.
--   2. provider_credential_rotate   REQUIRED — rotation is an ordered, multi-step
--      state change that must not be interruptible halfway; composing it from put
--      plus a caller-issued UPDATE would leave the same window with less control.
--   3. provider_credential_resolve  REQUIRED, MOST CONSTRAINED — and the one to be
--      most suspicious of. Plaintext must cross the RPC boundary for a provider
--      call to happen at all; there is no alternative under PostgREST. Its exposure
--      is minimised structurally (see the function's own contract below) and it is
--      the ONLY function in the platform that returns credential plaintext.
--   4. provider_credential_revoke   REQUIRED — destroying Vault material needs
--      privilege that service_role cannot exercise through PostgREST at all.
--
--   DELIBERATELY NOT CREATED: no activate, no deactivate, no list, no describe,
--   no "resolve by credential id" (that would add an enumeration dimension for
--   nothing), no bulk variant, no generic vault_get / vault_put passthrough, and
--   no update_secret path (rotation appends a new secret; the old one is never
--   rewritten in place).
--
-- ── THE FOUR SEMANTIC RULES CB-001.2 ESTABLISHED, HONOURED HERE ──────────────
--   1. supersession = like-for-like replacement INSIDE one rotation unit.
--   2. rotation unit = business_connection_id + credential_type. rotate() takes
--      NEITHER from the caller: both are inherited from the predecessor row, so a
--      cross-connection or cross-type successor is unrepresentable by construction
--      and the certified FK is the second line of defence.
--   3. abandonment = revoked + revoked_at.
--   4. payload / shape evolution = rotation_metadata_safe. A provider changing the
--      SHAPE of a credential does not change its ROLE.
--
-- ── SECRET NAMING — OPAQUE, AND THE PROVIDER NAME IS EXCLUDED TOO ────────────
--   vision-provider-credential:{credential_uuid}
--   The uuid is the provider_credentials row id. NOTHING else goes in: no business
--   name, no customer name, no provider organization / realm / item id, no email,
--   no account number, no user name, AND NO PROVIDER NAME. Provider identity is
--   already derivable through the connection; putting it in the Vault name would
--   leak provider relationships to anyone who can read Vault's metadata without
--   reading the relational model. The name must stay a pure opaque handle.
--   The uuid is generated HERE (a real uuid collision is not a practical concern,
--   and the id carries no information about the business).
--
-- ── THE ACL TRAP, DEFEATED EXPLICITLY — ORDER IS CORRECTNESS ─────────────────
--   PostgreSQL grants EXECUTE to PUBLIC on every newly created function, and this
--   project's default ACL is broad. For EACH function, in this order:
--       REVOKE ALL ... FROM PUBLIC
--       REVOKE ALL ... FROM anon
--       REVOKE ALL ... FROM authenticated
--       REVOKE ALL ... FROM service_role
--       GRANT EXECUTE ... TO service_role
--   REVOKE-then-GRANT lands on exactly {service_role: EXECUTE}. GRANT-then-REVOKE
--   would land on NOTHING and silently lock every backend caller out. Never
--   reorder these statements. Withholding the REVOKE from PUBLIC is the single
--   most dangerous omission in this file: it would make a plaintext-returning
--   function reachable by anon through PostgREST.
--
-- ── OWNER AND search_path ───────────────────────────────────────────────────
--   Every function is SECURITY DEFINER and its owner is PINNED to postgres: a
--   SECURITY DEFINER function runs with its OWNER's privileges, so an unpinned
--   owner would silently change who the wrapper executes as.
--   Every function pins `search_path = pg_catalog, vault, public`, and every
--   object reference inside is schema-qualified, so pg_temp or a caller-influenced
--   schema cannot shadow anything the wrappers touch. pg_catalog is listed FIRST
--   so operators and type resolution cannot be redirected either.
--
-- ── TRANSACTION SEMANTICS ───────────────────────────────────────────────────
--   vault.create_secret is an ordinary INSERT into vault.secrets, and a
--   PostgREST RPC runs in ONE transaction. Therefore:
--     • put      : secret creation + row insert commit together or not at all.
--     • rotate   : new secret + successor row + predecessor state + successor
--                  state are ONE transaction. A partial rotation is impossible, so
--                  an orphaned Vault secret and a half-rotated unit cannot exist.
--     • revoke   : secret destruction + row state commit together. A revoked row
--                  can never point at a secret that still exists, and a destroyed
--                  secret can never leave a row pointing at nothing.
--   Any RAISE inside a wrapper aborts the whole call; nothing partial survives.
--
-- ── ASSUMED DEPLOYED SURFACE (verified before writing, not assumed) ──────────
--   vault.secrets            (table, encrypted values)
--   vault.decrypted_secrets  (view, decrypted values)
--   vault.create_secret(text, text [, text, uuid])  <- invoked with TWO arguments
--   The two-argument arity is the version-independent minimum and is confirmed by
--   the certification artifact as a MANUAL blocker, not silently trusted.
--
-- ── IDEMPOTENT / ATOMIC ─────────────────────────────────────────────────────
--   create or replace function is idempotent; REVOKE/GRANT are idempotent; ALTER
--   OWNER is idempotent. The whole file is ONE transaction.
--
-- ROLLBACK (safe: drops only the wrapper surface, touching no data)
--   -- begin;
--   --   drop function if exists public.provider_credential_revoke(uuid, uuid, uuid);
--   --   drop function if exists public.provider_credential_resolve(uuid, uuid, text);
--   --   drop function if exists public.provider_credential_rotate(uuid, text, timestamptz, jsonb);
--   --   drop function if exists public.provider_credential_put(uuid, uuid, text, text, timestamptz, jsonb);
--   -- commit;
-- ============================================================================

begin;

-- ============================================================================
-- 1. provider_credential_put
-- ============================================================================
-- Creates the Vault secret AND its provider_credentials row in one transaction,
-- and returns ONLY the new credential id — NEVER the secret, NEVER the vault id.
--
-- The credential is created ACTIVE. A credential whose material is already
-- available is usable immediately, and creating it active is what makes the
-- one-active-per-rotation-unit index do its job: a second put() into a unit that
-- already holds an active credential is REJECTED by the database. Rotation is the
-- only way to replace a live credential, and that is exactly the intent.
--
-- The provider binding is enforced HERE because the database cannot see it: the
-- type -> provider relationship is derived through the connection, which is why
-- base44/shared/providers/vocabulary.ts states it is the application layer's job.
-- This function IS that layer now that credentials are written through it.
create or replace function public.provider_credential_put(
  p_business_id            uuid,
  p_business_connection_id uuid,
  p_credential_type        text,
  p_secret                 text,
  p_expires_at             timestamptz default null,
  p_rotation_metadata_safe jsonb       default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, vault, public
as $$
declare
  v_credential_id uuid := gen_random_uuid();
  v_secret_name   text;
  v_vault_id      uuid;
  v_provider      text;
  v_conn_status   text;
  v_expected      text;
begin
  -- ── Malformed input. Messages never echo the secret. ─────────────────────
  if p_business_id is null or p_business_connection_id is null then
    raise exception 'provider_credential_put: business_id and business_connection_id are required'
      using errcode = '22023';
  end if;
  if p_credential_type is null then
    raise exception 'provider_credential_put: credential_type is required'
      using errcode = '22023';
  end if;
  if p_secret is null or length(p_secret) = 0 then
    raise exception 'provider_credential_put: secret is required'
      using errcode = '22023';
  end if;

  -- ── Structural binding: the connection must exist AND belong to the business.
  select bc.provider, bc.status
    into v_provider, v_conn_status
  from public.business_connections bc
  where bc.id = p_business_connection_id
    and bc.business_id = p_business_id;

  if not found then
    raise exception 'provider_credential_put: connection not found for business'
      using errcode = '42501';
  end if;

  -- A dead connection accepts no new credential.
  if v_conn_status in ('disconnected', 'revoked') then
    raise exception 'provider_credential_put: connection is not accepting credentials'
      using errcode = '42501';
  end if;

  -- ── Type -> provider binding. Mirrors CREDENTIAL_TYPE_PROVIDER in
  -- base44/shared/providers/vocabulary.ts, which the static harness keeps in step.
  v_expected := case p_credential_type
    when 'plaid_access'       then 'plaid'
    when 'quickbooks_refresh' then 'quickbooks'
    when 'quickbooks_access'  then 'quickbooks'
    when 'xero_refresh'       then 'quickbooks'  -- placeholder binding: xero not yet admitted
    when 'xero_access'        then 'quickbooks'
    when 'wave_access'        then 'quickbooks'
    when 'wave_refresh'       then 'quickbooks'
    when 'payroll_access'     then 'quickbooks'
    when 'crm_access'         then 'quickbooks'
    else null
  end;

  if v_expected is null then
    raise exception 'provider_credential_put: unknown credential_type'
      using errcode = '22023';
  end if;
  if v_expected <> v_provider then
    raise exception 'provider_credential_put: credential_type does not belong to the connection provider'
      using errcode = '22023';
  end if;

  -- ── Opaque Vault secret name. Nothing identifying is ever encoded here.
  v_secret_name := 'vision-provider-credential:' || v_credential_id::text;

  -- ── Vault material first. If the INSERT below fails, the transaction aborts and
  -- this secret creation is undone with it — no orphan is possible.
  v_vault_id := vault.create_secret(p_secret, v_secret_name);

  insert into public.provider_credentials
    (id, business_connection_id, business_id, credential_type, status,
     vault_secret_id, expires_at, rotation_metadata_safe)
  values
    (v_credential_id, p_business_connection_id, p_business_id, p_credential_type, 'active',
     v_vault_id, p_expires_at, coalesce(p_rotation_metadata_safe, '{}'::jsonb));

  return v_credential_id;
end;
$$;

alter function public.provider_credential_put(uuid, uuid, text, text, timestamptz, jsonb) owner to postgres;

-- ============================================================================
-- 2. provider_credential_rotate
-- ============================================================================
-- Replaces a live credential with a successor INSIDE the same rotation unit.
--
-- THE CALLER SUPPLIES NO connection AND NO credential_type. Both are inherited
-- from the predecessor row, so a cross-connection or cross-type successor cannot
-- be requested — only the certified FK could still object, and it never has cause
-- to. This is strictly stronger than validating caller-supplied values.
--
-- ORDERING (each step justified; the whole sequence is one transaction)
--   1. create the successor Vault secret
--   2. insert the successor as 'pending'  — one_active_idx allows only ONE active
--      credential per rotation unit, so an active successor cannot be inserted
--      while the predecessor is still active
--   3. mark the predecessor 'superseded' + pointer  — the successor already exists
--      with the same connection and type, so the CB-001.2 FK is satisfied, and the
--      lifecycle CHECK is satisfied because the pointer is set in the same UPDATE
--   4. promote the successor to 'active' — the unit is now unambiguously owned
--
-- THE PREDECESSOR'S VAULT MATERIAL IS NOT DESTROYED HERE, DELIBERATELY. A provider
-- may still accept the previous material during its own grace window, and
-- destroying it is not rotation's decision to make. Retirement of the predecessor's
-- material is an explicit, separate act: provider_credential_revoke.
create or replace function public.provider_credential_rotate(
  p_predecessor_credential_id uuid,
  p_secret                     text,
  p_expires_at                 timestamptz default null,
  p_rotation_metadata_safe     jsonb       default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, vault, public
as $$
declare
  v_successor_id uuid := gen_random_uuid();
  v_vault_id     uuid;
  v_pred_status  text;
  v_pred_conn    uuid;
  v_pred_bus     uuid;
  v_pred_type    text;
  v_conn_status  text;
begin
  if p_predecessor_credential_id is null then
    raise exception 'provider_credential_rotate: predecessor credential is required'
      using errcode = '22023';
  end if;
  if p_secret is null or length(p_secret) = 0 then
    raise exception 'provider_credential_rotate: secret is required'
      using errcode = '22023';
  end if;

  -- The predecessor is the ONLY credential-shaped input. Everything else is read
  -- from this row, so the caller cannot widen the rotation unit.
  select c.status, c.business_connection_id, c.business_id, c.credential_type, bc.status
    into v_pred_status, v_pred_conn, v_pred_bus, v_pred_type, v_conn_status
  from public.provider_credentials c
  join public.business_connections bc on bc.id = c.business_connection_id
  where c.id = p_predecessor_credential_id;

  if not found then
    raise exception 'provider_credential_rotate: credential not found'
      using errcode = '42501';
  end if;

  -- A retired credential is history. Replacing it would rewrite provenance; a
  -- fresh credential in that unit is a put, not a rotation.
  if v_pred_status in ('revoked', 'superseded') then
    raise exception 'provider_credential_rotate: credential is already terminal and cannot be rotated'
      using errcode = '42501';
  end if;

  if v_conn_status in ('disconnected', 'revoked') then
    raise exception 'provider_credential_rotate: connection is not accepting credentials'
      using errcode = '42501';
  end if;

  v_vault_id := vault.create_secret(p_secret, 'vision-provider-credential:' || v_successor_id::text);

  insert into public.provider_credentials
    (id, business_connection_id, business_id, credential_type, status,
     vault_secret_id, expires_at, rotation_metadata_safe)
  values
    (v_successor_id, v_pred_conn, v_pred_bus, v_pred_type, 'pending',
     v_vault_id, p_expires_at, coalesce(p_rotation_metadata_safe, '{}'::jsonb));

  update public.provider_credentials
     set status = 'superseded',
         superseded_by_credential_id = v_successor_id
   where id = p_predecessor_credential_id;

  update public.provider_credentials
     set status = 'active'
   where id = v_successor_id;

  return v_successor_id;
end;
$$;

alter function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) owner to postgres;

-- ============================================================================
-- 3. provider_credential_resolve   — the only plaintext-returning function
-- ============================================================================
-- Returns the plaintext of the ONE active credential of a rotation unit, or NULL.
--
-- NO CREDENTIAL ID IS ACCEPTED. Resolution is addressed by
-- (business_id, business_connection_id, credential_type) — the rotation unit
-- itself. Credential ids are therefore NOT an enumeration dimension for plaintext:
-- guessing an id achieves nothing, because ids are never read here.
--
-- IT RETURNS NULL, NEVER AN ERROR, WHEN NOTHING IS RESOLVABLE. A caller cannot
-- distinguish "no such connection", "not your business", "revoked", "superseded"
-- or "expired" — so the function is not an existence or state oracle.
--
-- IT NEVER RETURNS A VALUE FOR:
--   • a credential that is not exactly 'active'
--   • a credential carrying a supersession pointer (a superseded predecessor is
--     UNREACHABLE here by construction — there is no "unless explicitly justified"
--     branch, and there will not be one)
--   • a credential with no Vault reference
--   • a credential whose expires_at has passed (checked with clock_timestamp(), so
--     staleness is judged at call time, not at transaction start)
--   • a connection that is disconnected or revoked
--   • a business_id / connection pair that does not agree with the credential row
--
-- IT NEVER WRITES. An expired-but-still-'active' row is simply not resolvable; the
-- caller's remedy is rotation, not a side effect inside a read path.
--
-- IT PERFORMS NO LOGGING AND RETURNS NO METADATA. One text value or NULL.
--
-- RESIDUAL RISK, STATED HONESTLY: this executes as service_role, so it cannot know
-- WHICH actor called. A caller that reached it with arbitrary business and
-- connection ids could resolve another business's credential. That is a CALL-SITE
-- obligation, not a database one: authenticateActor() -> authorizeBusinessAccess()
-- -> derive the connection server-side. The wrapper is defence in depth, never the
-- authorization decision.
create or replace function public.provider_credential_resolve(
  p_business_id            uuid,
  p_business_connection_id uuid,
  p_credential_type        text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, vault, public
as $$
declare
  v_secret text;
begin
  if p_business_id is null or p_business_connection_id is null or p_credential_type is null then
    return null;
  end if;

  select ds.decrypted_secret
    into v_secret
  from public.provider_credentials c
  join public.business_connections bc
    on bc.id = c.business_connection_id
   and bc.business_id = p_business_id
  join vault.decrypted_secrets ds
    on ds.id = c.vault_secret_id
  where c.business_id = p_business_id
    and c.business_connection_id = p_business_connection_id
    and c.credential_type = p_credential_type
    and c.status = 'active'
    and c.superseded_by_credential_id is null
    and c.vault_secret_id is not null
    and (c.expires_at is null or c.expires_at > clock_timestamp())
    and bc.status not in ('disconnected', 'revoked');

  return v_secret;
end;
$$;

alter function public.provider_credential_resolve(uuid, uuid, text) owner to postgres;

-- ============================================================================
-- 4. provider_credential_revoke
-- ============================================================================
-- Destroys Vault material and marks the credential revoked. THE ROW IS NEVER
-- DELETED — provider_credentials is an append-oriented provenance ledger and no
-- role holds DELETE on it (CB-001 withheld it; CB-002 does not add it).
--
-- BINDING: credential id AND business id AND connection id must all match the same
-- row. Knowing an id is not enough to act on it.
--
-- VAULT MATERIAL IS DESTROYED, AND THE REFERENCE IS NULLED IN THE SAME STATEMENT
-- PAIR. Nulling vault_secret_id is not tidiness: a revoked row that still pointed
-- at a deleted secret would be a dangling reference, and the coherence invariant
-- "every non-null vault_secret_id names a live secret" would be broken. After
-- revoke the row is honest about having no material.
--
-- TWO TERMINAL CASES, ONE FUNCTION, NO PROVENANCE LOSS:
--   • not yet superseded -> status 'revoked' + revoked_at (set once; a repeat call
--     preserves the original timestamp), material destroyed.
--   • already superseded -> material destroyed, status and supersession pointer
--     PRESERVED. A superseded credential is history; overwriting 'superseded' with
--     'revoked' would destroy the record of how rotation actually happened, so the
--     Vault material is retired without touching the provenance.
-- Idempotent: revoking an already-revoked credential destroys nothing further and
-- keeps the first revocation timestamp.
create or replace function public.provider_credential_revoke(
  p_credential_id          uuid,
  p_business_id            uuid,
  p_business_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, vault, public
as $$
declare
  v_row_id     uuid;
  v_status     text;
  v_vault_id   uuid;
begin
  if p_credential_id is null or p_business_id is null or p_business_connection_id is null then
    raise exception 'provider_credential_revoke: credential, business and connection are all required'
      using errcode = '22023';
  end if;

  select c.id, c.status, c.vault_secret_id
    into v_row_id, v_status, v_vault_id
  from public.provider_credentials c
  where c.id = p_credential_id
    and c.business_id = p_business_id
    and c.business_connection_id = p_business_connection_id;

  if not found then
    raise exception 'provider_credential_revoke: credential not found for business and connection'
      using errcode = '42501';
  end if;

  -- Destroy the material first, then drop the reference, so a failure can never
  -- leave a reference to a destroyed secret.
  if v_vault_id is not null then
    delete from vault.secrets where id = v_vault_id;
    update public.provider_credentials
       set vault_secret_id = null
     where id = v_row_id;
  end if;

  -- Superseded history: material retired, provenance untouched.
  if v_status = 'superseded' then
    return;
  end if;

  update public.provider_credentials
     set status = 'revoked',
         revoked_at = coalesce(revoked_at, clock_timestamp())
   where id = v_row_id;
end;
$$;

alter function public.provider_credential_revoke(uuid, uuid, uuid) owner to postgres;

-- ============================================================================
-- 5. LOCKDOWN — REVOKE FIRST, THEN THE ONE EXACT GRANT
-- ============================================================================
-- PostgreSQL grants EXECUTE on a new function to PUBLIC, and this project's
-- default ACL is broad. Every function is therefore revoked from all four, then
-- granted to service_role ONLY. Order is a correctness property: REVOKE-then-GRANT
-- lands on exactly {service_role: EXECUTE}; the reverse would land on nothing and
-- lock out every backend caller.
--
-- No table privilege is granted to anyone here. The wrappers execute as their
-- owner (postgres); the caller needs EXECUTE on the function and nothing else.

revoke all on function public.provider_credential_put(uuid, uuid, text, text, timestamptz, jsonb) from PUBLIC;
revoke all on function public.provider_credential_put(uuid, uuid, text, text, timestamptz, jsonb) from anon;
revoke all on function public.provider_credential_put(uuid, uuid, text, text, timestamptz, jsonb) from authenticated;
revoke all on function public.provider_credential_put(uuid, uuid, text, text, timestamptz, jsonb) from service_role;

revoke all on function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) from PUBLIC;
revoke all on function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) from anon;
revoke all on function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) from authenticated;
revoke all on function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) from service_role;

revoke all on function public.provider_credential_resolve(uuid, uuid, text) from PUBLIC;
revoke all on function public.provider_credential_resolve(uuid, uuid, text) from anon;
revoke all on function public.provider_credential_resolve(uuid, uuid, text) from authenticated;
revoke all on function public.provider_credential_resolve(uuid, uuid, text) from service_role;

revoke all on function public.provider_credential_revoke(uuid, uuid, uuid) from PUBLIC;
revoke all on function public.provider_credential_revoke(uuid, uuid, uuid) from anon;
revoke all on function public.provider_credential_revoke(uuid, uuid, uuid) from authenticated;
revoke all on function public.provider_credential_revoke(uuid, uuid, uuid) from service_role;

grant execute on function public.provider_credential_put(uuid, uuid, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) to service_role;
grant execute on function public.provider_credential_resolve(uuid, uuid, text) to service_role;
grant execute on function public.provider_credential_revoke(uuid, uuid, uuid) to service_role;

commit;

-- ============================================================================
-- PRODUCTION GATES THAT THIS MIGRATION DOES NOT OPEN
-- ============================================================================
--   1. ROOT KEY. Supabase Vault root-key custody/configuration has NOT been
--      manually confirmed. CB-002 may be deployed and exercised with SYNTHETIC
--      credentials only. Vault is NOT declared production-ready, no real provider
--      credential is stored, and Plaid/QBO production remain blocked.
--   2. CALL-SITE AUTHORIZATION. The wrappers cannot see an actor. Before the first
--      real provider connection, every call site must prove the Security Kernel
--      sequence and must derive business_id / connection_id server-side.
--   3. create_secret ARITY. This file invokes vault.create_secret(secret, name).
--      The deployed Vault version's arity must be confirmed by the certification.
--   4. NO PROVIDER INTEGRATION. CB-002 stores and retires material. It calls no
--      provider, and it does not begin 6D.1C or enable fact promotion.
-- ============================================================================