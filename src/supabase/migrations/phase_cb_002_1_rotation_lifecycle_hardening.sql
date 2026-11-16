-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  VISION — CONNECTED BUSINESS                                              ║
-- ║  CB-002.1 — CREDENTIAL ROTATION LIFECYCLE HARDENING                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- THE DEFECT THIS FILE CLOSES
--   The deployed provider_credential_rotate refused a predecessor ONLY when its
--   status was one of two terminal states — revoked or superseded. That is a
--   BLACKLIST, and a blacklist fails OPEN: every other state the lifecycle can
--   hold was accepted as a rotation predecessor, including states that are not a
--   usable credential at all, and including any state a future vocabulary change
--   might introduce.
--
--   The normal wrapper lifecycle does not leave a committed `pending` credential
--   — the successor is promoted to `active` in the same transaction it is
--   inserted — but the invariant was never enforced by the credential boundary
--   itself: service_role holds INSERT on provider_credentials and the column
--   DEFAULT for `status` is a non-active state, so a single direct write could
--   place a credential in a state the rotation gate treated as rotatable. An
--   invariant that depends on nobody writing directly is not an invariant.
--
--   Real provider credentials must not be admitted while that is true.
--
-- THE INVARIANT, MADE STRUCTURAL
--   A credential may be used as the predecessor of a rotation ONLY when it is
--   currently `active`. Every other state is refused: pending, rotating,
--   superseded, revoked, expired, error — and anything else, because the rule is
--   now an ALLOWLIST. A state that does not exist yet cannot be admitted by
--   omission.
--
-- WHY `active` AND NOTHING ELSE
--   Rotation replaces a credential that is IN SERVICE, and `active` is the only
--   state any wrapper ever produces for a live credential:
--     · provider_credential_put inserts `active` directly;
--     · provider_credential_rotate inserts the successor as `pending` and
--       promotes it to `active` within the same transaction;
--     · `rotating`, `expired` and `error` exist in the deployed CHECK vocabulary
--       but NO wrapper writes them. Admitting any of them here would be
--       inventing a lifecycle, not honouring one;
--     · `expired` is derived from expires_at at read time, never stored, so an
--       expired credential is re-admitted by a fresh put, not by a rotation.
--
-- SCOPE — ONE FUNCTION, AND NOTHING ELSE
--   Replaced: public.provider_credential_rotate(uuid, text, timestamptz, jsonb)
--             — the predecessor gate becomes the active-only allowlist.
--   Re-asserted: owner, SECURITY DEFINER, pinned search_path, and the explicit
--             EXECUTE lockdown (REVOKE from PUBLIC/anon/authenticated/
--             service_role, then GRANT to service_role only).
--   Untouched: the provider_credentials table, every constraint, every index,
--             RLS state, table privileges, Vault, business_connections, and the
--             put / resolve / revoke wrappers — each remains exactly as
--             certified by CB-001, CB-001.1, CB-001.2 and CB-002.
--   No relation is created, so the SEC-031 pg_default_acl trap is NOT re-armed:
--   there is no new table, view, index, policy or trigger for default privileges
--   to seed.
--
-- CREATE OR REPLACE, NEVER DROP + CREATE
--   DROP would re-apply default function privileges — which grant PUBLIC EXECUTE
--   — and would discard the function OID together with its grants. CREATE OR
--   REPLACE preserves both. The explicit REVOKE/GRANT block below is therefore a
--   re-assertion of intent, not a repair for a lost ACL: this project does not
--   rely on preserved or default ACL behaviour anywhere.
--
-- THE GATE MUST PRECEDE vault.create_secret
--   A refused rotation must create ZERO Vault material. The predecessor gate is
--   evaluated before the connection-lifecycle gate and before any Vault call, so
--   every rejection is a pure read-side refusal.
--
-- THE PREDECESSOR'S VAULT MATERIAL IS STILL NOT DESTROYED HERE
--   Unchanged, and deliberately so. Retirement of the predecessor's material
--   remains the explicit act of provider_credential_revoke. Material retention
--   policy is a separate, separately-certified concern and is NOT decided here.
--
-- NULL SAFETY
--   `status` is NOT NULL and the not-found case is handled above the gate, so
--   `<> 'active'` is exact and true for every value that is not 'active'. If this
--   column were ever made nullable, the gate must become `is distinct from`
--   'active' so a NULL cannot slip past a three-valued comparison. The
--   certification asserts the allowlist form; the static harness asserts that
--   regression to any membership test is caught.
--
-- EXPECTED RESULT
--   The function behaves identically for every legitimate rotation, and refuses
--   every predecessor that is not `active`, with the same SQLSTATE class (42501)
--   the previous terminal-state refusal used.
-- ============================================================================

begin;

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

  -- ── THE PREDECESSOR GATE — ACTIVE-ONLY, AND FAIL-CLOSED (CB-002.1) ─────────
  -- Rotation replaces a credential that is IN SERVICE. Only the state the
  -- lifecycle holds as usable qualifies; every other state — pending, rotating,
  -- superseded, revoked, expired, error — is refused here, and so is any state a
  -- future vocabulary change might add.
  --
  -- This is deliberately an ALLOWLIST. A rule that enumerates the states to
  -- refuse fails OPEN for a state that does not exist yet; this form fails closed
  -- for all of them, which is the only acceptable direction for a credential
  -- lifecycle.
  --
  -- `status` is NOT NULL and the not-found case is handled above, so this
  -- comparison is exact. If the column were ever made nullable, this gate must
  -- become `is distinct from` so a NULL cannot pass a three-valued comparison.
  --
  -- ORDER IS A SECURITY PROPERTY: this gate MUST precede the Vault write below, so
  -- a refused rotation creates ZERO Vault material. (The call is deliberately not
  -- NAMED in this comment: the certification locates it positionally, and a prose
  -- mention above the gate would be indistinguishable from the gate coming after.)
  if v_pred_status <> 'active' then
    raise exception 'provider_credential_rotate: predecessor credential is not active and cannot be rotated'
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

revoke all on function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) from PUBLIC;
revoke all on function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) from anon;
revoke all on function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) from authenticated;
revoke all on function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) from service_role;

grant execute on function public.provider_credential_rotate(uuid, text, timestamptz, jsonb) to service_role;

commit;