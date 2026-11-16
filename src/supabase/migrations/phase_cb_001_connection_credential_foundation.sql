-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-001 — CONNECTION + CREDENTIAL FOUNDATION
-- ============================================================================
--
-- Creates the provider-neutral connection registry and the credential METADATA
-- ledger. Nothing here is provider-specific: QuickBooks and Plaid are values in a
-- vocabulary, not shapes in a schema.
--
-- SCOPE BOUNDARY (deliberate):
--   • NO credential plaintext is stored, ever. provider_credentials holds an
--     opaque Vault secret id and safe lifecycle metadata only.
--   • NO Vault access of any kind happens in CB-001. No vault.create_secret,
--     no vault.update_secret, no reads of vault.secrets / vault.decrypted_secrets.
--     Vault integration begins in CB-002.
--   • NO RLS policies are created. anon and authenticated have no access at all;
--     the browser read path is designed later and goes through backend functions.
--   • DEFENSE IN DEPTH on safe metadata: the object columns additionally reject
--     credential-SHAPED TOP-LEVEL KEYS at the database level, behind (not instead
--     of) the vocabulary validator. The test is exact-key membership — never a
--     substring match — so token_expires_at, rotation_reason, provider_version and
--     secret_reference_id remain legal. camelCase / dashed / nested variants are
--     deliberately the validator's job, not the CHECK's: enumerating every variant
--     here is the recursive scanner this migration refuses to become.
--   • ZERO interaction with business_facts / business_fact_evidence /
--     business_fact_conflicts / shadow promotion / resolver behaviour.
--
-- VERIFIED TARGETS (probed live before writing, not assumed):
--   business_entities(id uuid) — the canonical business identity
--     (confirmed by business_facts_business_id_fkey → business_entities(id))
--   profiles(id uuid) — the canonical actor identity
--
-- ACTOR vs BUSINESS DELETE SEMANTICS:
--   business_id  → ON DELETE CASCADE  (a connection cannot outlive its business;
--                                      matches the Digital Twin's own choice)
--   actor columns → ON DELETE SET NULL (connections are an audit spine. Deleting
--                                      a profile must never delete connection
--                                      history — attribution is simply lost.)
--
-- ACL POSTURE (SEC-031 / SEC-032 are live debt — defaults are NOT trusted):
--   Every new relation is explicitly REVOKEd from PUBLIC/anon/authenticated and
--   granted narrowly to service_role. RLS is enabled explicitly rather than
--   relying on the rls_auto_enable event trigger.
--   service_role has BYPASSRLS, so for it the GRANTs are the real control — which
--   is exactly why DELETE is withheld: credential and connection history must
--   never be destroyed by a normal lifecycle operation.

begin;

-- ============================================================================
-- 1. business_connections — provider-neutral connection registry
-- ============================================================================
create table if not exists public.business_connections (
  id                          uuid primary key default gen_random_uuid(),
  business_id                 uuid not null references public.business_entities(id) on delete cascade,

  provider                    text not null,
  connection_category         text not null,
  provider_organization_id    text not null,
  provider_organization_name  text null,
  display_name                text null,

  -- Connection lifecycle. Deliberately NOT conflated with sync_status.
  status                      text not null default 'connecting',
  capabilities                jsonb not null default '{}'::jsonb,

  connected_by_profile_id     uuid null references public.profiles(id) on delete set null,
  initiated_by_profile_id     uuid null references public.profiles(id) on delete set null,
  connected_at                timestamptz null,

  disconnected_at             timestamptz null,
  disconnected_by_profile_id  uuid null references public.profiles(id) on delete set null,

  -- Sync observability. Nullable: NULL means "no synchronization has happened
  -- yet", which is not the same statement as any of the status values.
  last_sync_started_at        timestamptz null,
  last_sync_completed_at      timestamptz null,
  last_successful_sync_at     timestamptz null,
  sync_status                 text null,
  last_error_class            text null,
  reauthorization_required    boolean not null default false,

  metadata_safe               jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Vocabulary. Deliberate CHECK allowlists rather than an unrestricted string
  -- (integrity now) or a Postgres ENUM (rigid: ADD VALUE is awkward and values
  -- cannot be removed). Adding a provider is a one-line constraint swap in the
  -- next provider migration — no redesign. See base44/shared/providers/vocabulary.ts.
  constraint business_connections_provider_check
    check (provider in ('quickbooks', 'plaid')),
  constraint business_connections_category_check
    check (connection_category in ('accounting', 'banking', 'payroll', 'crm', 'other')),
  constraint business_connections_status_check
    check (status in ('connecting', 'active', 'syncing', 'needs_attention', 'error', 'disconnected', 'revoked')),
  constraint business_connections_sync_status_check
    check (sync_status is null or sync_status in ('idle', 'running', 'failed', 'needs_reauth')),

  -- A provider organization id is an opaque non-empty handle.
  constraint business_connections_provider_org_not_blank
    check (length(btrim(provider_organization_id)) > 0),

  -- Safe-metadata columns must hold JSON OBJECTS. A scalar or array can silently
  -- hold a bare token string; an object keyed by intent cannot.
  constraint business_connections_capabilities_is_object
    check (jsonb_typeof(capabilities) = 'object'),
  constraint business_connections_metadata_is_object
    check (jsonb_typeof(metadata_safe) = 'object'),

  -- Defense in depth: a credential VALUE must not ride into safe metadata under a
  -- credential-shaped KEY. `?|` is jsonb EXACT-KEY membership, so this rejects only
  -- whole top-level keys and can never over-block a legitimate key that merely
  -- contains a credential word (token_expires_at, secret_reference_id).
  constraint business_connections_metadata_no_credential_keys
    check (not (metadata_safe ?| array['access_token', 'refresh_token', 'public_token',
                                       'authorization_code', 'client_secret', 'client_secret_value',
                                       'password', 'credential_value', 'plaintext_secret',
                                       'decrypted_secret', 'token_value', 'secret_value',
                                       'token', 'secret']::text[])),

  -- A disconnected connection must record when it was disconnected (§20 audit spine).
  constraint business_connections_disconnected_shape
    check (status <> 'disconnected' or disconnected_at is not null),

  -- UNIQUE CONNECTION IDENTITY — prevents the same provider organization being
  -- attached to the same VISION business twice.
  constraint business_connections_identity_unique
    unique (business_id, provider, provider_organization_id),

  -- Same-business integrity anchor, mirroring the Phase 6C pattern
  -- (business_facts_id_business_unique). This is what lets provider_credentials
  -- prove at the DATABASE level that its connection belongs to its business.
  constraint business_connections_id_business_unique
    unique (id, business_id)
);

-- Indexes: only the three query paths that actually exist.
--   • the business's own connection list      → (business_id, status)
--   • webhook/token-exchange resolution by
--     provider organization id (item/realm)   → (provider, provider_organization_id)
--   • operational sweeps ("all active plaid") → (provider, status)
-- The identity unique constraint already indexes
-- (business_id, provider, provider_organization_id) and is not duplicated here.
create index if not exists business_connections_business_status_idx
  on public.business_connections (business_id, status);
create index if not exists business_connections_provider_org_idx
  on public.business_connections (provider, provider_organization_id);
create index if not exists business_connections_provider_status_idx
  on public.business_connections (provider, status);

-- ============================================================================
-- 2. provider_credentials — CREDENTIAL METADATA ONLY
-- ============================================================================
-- This table must NEVER contain plaintext: access token, refresh token, public
-- token, authorization code, or client secret. The credential value lives in
-- Vault (CB-002); this row only records that a credential exists, what kind it
-- is, how it is doing, and which opaque Vault secret holds it.
create table if not exists public.provider_credentials (
  id                          uuid primary key default gen_random_uuid(),
  business_connection_id      uuid not null,
  business_id                 uuid not null,

  credential_type             text not null,

  -- Opaque Vault secret id. NULL until CB-002 stores the value.
  -- The Vault secret NAME must stay opaque — conceptually
  --   vision-provider-credential:{credential_uuid}
  -- and must NEVER encode business id, business name, provider organization
  -- name, customer name, email, or any other identifying metadata. The relational
  -- model already establishes credential → connection → business.
  vault_secret_id             uuid null,

  status                      text not null default 'pending',
  expires_at                  timestamptz null,
  rotation_metadata_safe      jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  revoked_at                  timestamptz null,

  -- Rotation is recorded, never overwritten in place: the old credential points
  -- at the new one, so the rotation is atomic to read and fully auditable.
  superseded_by_credential_id uuid null,

  -- ── SAME-BUSINESS INTEGRITY (structural, not application-enforced) ────────
  -- The Phase 6C composite-FK pattern. A credential carries (connection_id,
  -- business_id) as ONE foreign key into (id, business_id), so a Business A
  -- credential is STRUCTURALLY INCAPABLE of referencing a Business B connection
  -- — rejected by the database even for service_role.
  constraint provider_credentials_connection_same_business_fkey
    foreign key (business_connection_id, business_id)
    references public.business_connections (id, business_id) on delete cascade,

  -- Supersession stays inside the same business.
  constraint provider_credentials_superseded_same_business_fkey
    foreign key (superseded_by_credential_id, business_id)
    references public.provider_credentials (id, business_id),

  -- Anchor for the supersession composite FK above.
  constraint provider_credentials_id_business_unique
    unique (id, business_id),

  constraint provider_credentials_type_check
    check (credential_type in (
      'plaid_access',
      'quickbooks_refresh',
      'quickbooks_access',
      'xero_refresh',
      'xero_access',
      'wave_access',
      'wave_refresh',
      'payroll_access',
      'crm_access'
    )),
  constraint provider_credentials_status_check
    check (status in ('pending', 'active', 'rotating', 'superseded', 'revoked', 'expired', 'error')),

  constraint provider_credentials_no_self_supersede
    check (superseded_by_credential_id is null or superseded_by_credential_id <> id),

  -- Lifecycle shape: a terminal state must carry its evidence.
  -- Expiration is NOT revocation and is deliberately not equated with it.
  constraint provider_credentials_lifecycle_shape
    check (
      (status <> 'revoked' or revoked_at is not null)
      and (status <> 'superseded' or superseded_by_credential_id is not null)
    ),

  constraint provider_credentials_rotation_metadata_is_object
    check (jsonb_typeof(rotation_metadata_safe) = 'object'),

  -- The same narrow, exact-key defense for rotation bookkeeping. Rotation must
  -- remain auditable WITHOUT the rotated value ever being storable beside it.
  constraint provider_credentials_rotation_metadata_no_credential_keys
    check (not (rotation_metadata_safe ?| array['access_token', 'refresh_token', 'public_token',
                                               'authorization_code', 'client_secret', 'client_secret_value',
                                               'password', 'credential_value', 'plaintext_secret',
                                               'decrypted_secret', 'token_value', 'secret_value',
                                               'token', 'secret']::text[])),

  constraint provider_credentials_expiry_after_creation
    check (expires_at is null or expires_at > created_at)
);

-- At most ONE active credential per (connection, credential_type). This makes
-- rotation deterministically safe: the new credential cannot be marked active
-- until the old one has left 'active'. Enforced by the database, not by code.
create unique index if not exists provider_credentials_one_active_idx
  on public.provider_credentials (business_connection_id, credential_type)
  where status = 'active';

-- All credentials belonging to a connection (lifecycle history / rotation view).
create index if not exists provider_credentials_connection_idx
  on public.provider_credentials (business_connection_id);

-- ============================================================================
-- 3. updated_at integrity
-- ============================================================================
-- The project has no shared public updated_at function. valuation.update_updated_at
-- is a SECURITY DEFINER function in another schema; depending on it from a public
-- connection table would couple this foundation to unreviewed privileges.
-- This one narrow, non-privileged trigger function is owned by this migration so
-- updated_at cannot be forgotten by any writer, service_role included.
create or replace function public.touch_connected_business_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_connected_business_updated_at() from public, anon, authenticated;

drop trigger if exists business_connections_touch_updated_at on public.business_connections;
create trigger business_connections_touch_updated_at
  before update on public.business_connections
  for each row execute function public.touch_connected_business_updated_at();

drop trigger if exists provider_credentials_touch_updated_at on public.provider_credentials;
create trigger provider_credentials_touch_updated_at
  before update on public.provider_credentials
  for each row execute function public.touch_connected_business_updated_at();

-- ============================================================================
-- 4. LOCKDOWN — explicit, never relying on defaults
-- ============================================================================
-- RLS is enabled explicitly (not left to the rls_auto_enable event trigger), and
-- NO policies are created: anon and authenticated are denied by grant layer AND
-- by the absence of any policy.
--
-- WHY service_role IS REVOKED HERE BEFORE IT IS GRANTED (corrected by CB-001.1)
--   This project's pg_default_acl grants ALL table privileges on newly created
--   relations — arwdDxtm = INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES,
--   TRIGGER, MAINTAIN — to service_role. Those privileges are materialized into
--   relacl AT CREATE TABLE TIME, before a single statement in this file runs.
--   A GRANT is purely ADDITIVE: granting SELECT, INSERT, UPDATE cannot narrow an
--   inherited arwdDxtm. Only an explicit REVOKE can.
--   Production proved it: CB-001 deployed and the live certification returned
--   exactly two FAILs (L and N) because service_role held
--   {postgres=arwdDxtm/postgres, service_role=arwdDxtm/postgres}. DELETE,
--   TRUNCATE, REFERENCES, TRIGGER and MAINTAIN survived the GRANT untouched —
--   the exact posture this design forbids. The REVOKE below is therefore not
--   belt-and-braces: it is the ONLY thing that establishes the intended set.
--
--   postgres (the owner) is deliberately NOT revoked. The owner's privileges are
--   implicit and survive any ACL edit, so touching its entry would change nothing
--   except the catalog's readability.
--
--   ORDER IS A CORRECTNESS PROPERTY, not style: REVOKE-then-GRANT ends at exactly
--   {select, insert, update}. GRANT-then-REVOKE would end at NOTHING — a silent
--   lockout of every backend writer. Never reorder these statements.
alter table public.business_connections enable row level security;
alter table public.provider_credentials enable row level security;

revoke all on table public.business_connections from public;
revoke all on table public.business_connections from anon;
revoke all on table public.business_connections from authenticated;
revoke all on table public.business_connections from service_role;

revoke all on table public.provider_credentials from public;
revoke all on table public.provider_credentials from anon;
revoke all on table public.provider_credentials from authenticated;
revoke all on table public.provider_credentials from service_role;

grant select, insert, update on table public.business_connections to service_role;
grant select, insert, update on table public.provider_credentials to service_role;

-- ============================================================================
-- 5. Documented invariants
-- ============================================================================
comment on table public.business_connections is
  'CB-001 — provider-neutral connection registry and audit spine. Never contains credentials. Rows are retained through disconnect, revocation and provider failure; lifecycle is expressed with status/timestamps, never by deleting the row.';
comment on table public.provider_credentials is
  'CB-001 — credential METADATA ONLY. Never stores plaintext access/refresh/public tokens, authorization codes or client secrets. The value lives in Vault; this row holds an opaque vault_secret_id and safe lifecycle/rotation metadata.';
comment on column public.provider_credentials.vault_secret_id is
  'Opaque Vault secret id. The corresponding Vault secret NAME must remain opaque (vision-provider-credential:{credential_uuid}) and must never encode business, provider-organization, customer, or account identity.';
comment on column public.business_connections.metadata_safe is
  'Safe metadata only (JSON object). Credential-shaped TOP-LEVEL keys are rejected twice: by the database CHECK business_connections_metadata_no_credential_keys (exact-key membership) and by base44/shared/providers/vocabulary.ts (which also covers camelCase, dashed, nested and array variants). Credential plaintext must never enter this column.';
comment on column public.provider_credentials.rotation_metadata_safe is
  'Safe rotation bookkeeping only (JSON object) — provider-side timestamps, version hints, rotation reason. Enforced by the CHECK provider_credentials_rotation_metadata_no_credential_keys (exact top-level key membership) plus base44/shared/providers/vocabulary.ts. Never a token or secret.';
comment on column public.business_connections.provider_organization_id is
  'Opaque provider handle for the organization (e.g. QuickBooks realm id, Plaid item id). Indexed, deliberately NOT globally unique: the same provider organization must never become a cross-business authorization primitive.';

commit;

-- ============================================================================
-- ROLLBACK (safe only while no real provider data exists)
-- ============================================================================
-- begin;
--   drop trigger if exists provider_credentials_touch_updated_at on public.provider_credentials;
--   drop trigger if exists business_connections_touch_updated_at on public.business_connections;
--   drop function if exists public.touch_connected_business_updated_at();
--   drop table if exists public.provider_credentials;   -- before business_connections
--   drop table if exists public.business_connections;
-- commit;