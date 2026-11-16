-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-001.2 — SUPERSESSION ROTATION-UNIT INTEGRITY
-- ============================================================================
-- CLOSES one latent integrity gap in the credential ledger, found during the
-- post-certification review and closed while the table is still EMPTY.
--
-- THE INVARIANT
--   If credential X records `superseded_by_credential_id = Y.id`, the database
--   must structurally guarantee that Y belongs to the SAME rotation unit as X:
--
--     X.business_id            = Y.business_id              (already enforced — retained)
--     X.business_connection_id = Y.business_connection_id   (ADDED HERE)
--     X.credential_type        = Y.credential_type          (ADDED HERE)
--
--   Same business was already guaranteed by provider_credentials_superseded_
--   same_business_fkey. Same connection and same credential_type were NOT: nothing
--   referenced the target's business_connection_id or credential_type, so a
--   QuickBooks refresh credential on connection 1 could be recorded as superseded
--   by a credential on connection 2 — or by a QuickBooks ACCESS credential on the
--   same connection. Both are unrepresentable rotations, and both were reachable.
--
-- WHY THE ROTATION UNIT IS (business_connection_id, credential_type)
--   The database already defines it. provider_credentials_one_active_idx is
--     unique (business_connection_id, credential_type) where status = 'active'
--   — rotation is canonically scoped to one connection and one credential role.
--   superseded_by_credential_id is the RECORD of that rotation, so a pointer able
--   to leave the unit contradicts the index that defines the unit.
--
-- THE FOUR SEMANTIC RULES THIS ENCODES
--   1. supersession = like-for-like replacement INSIDE one rotation unit. The
--      successor plays the same role, for the same connection.
--   2. rotation unit = business_connection_id + credential_type.
--   3. abandonment = status 'revoked' + revoked_at. A credential kind that is
--      abandoned — or replaced by a DIFFERENT KIND of credential — is revoked,
--      never cross-linked. That is what revoked_at is for, and
--      provider_credentials_lifecycle_shape already enforces it.
--   4. payload / shape evolution = rotation_metadata_safe, e.g.
--      {"rotation_reason": "...", "provider_version": 2}. A provider changing the
--      SHAPE of a credential does not change its ROLE, so it does not change
--      credential_type — and therefore never needs a cross-type supersession.
--
-- SCOPE — additive, structural, and nothing else.
--   Created: 2 constraints on public.provider_credentials (one unique anchor, one
--            foreign key). PostgreSQL creates the anchor's backing index.
--   Untouched: every existing CB-001 constraint — notably provider_credentials_
--            superseded_same_business_fkey, which remains as an independently
--            surviving guarantee — plus all columns, ACLs, RLS state, policies,
--            functions, triggers, default privileges, rows, Vault, provider
--            integrations and the Digital Twin fact tables.
--   NO table, view, function, trigger, policy, schema or sequence is created, so
--   the SEC-031 pg_default_acl trap is NOT re-armed: there is no new relation for
--   default privileges to seed with arwdDxtm, and no GRANT or REVOKE is needed.
--
-- NULL / MATCH SIMPLE — APPEND-ORIENTED HISTORY IS PRESERVED
--   superseded_by_credential_id is nullable and a composite FK uses MATCH SIMPLE,
--   so the constraint is vacuously satisfied whenever the pointer is NULL. Every
--   credential that was never replaced — the normal, append-oriented case — stays
--   legal, no existing row is affected, and future rotation is unaffected.
--
-- NO DELETE BEHAVIOUR
--   The new FK carries NO ON DELETE clause (NO ACTION), matching the existing
--   supersession FK: supersession history is never destroyed by a delete. No role
--   holds DELETE on this table in any case.
--
-- ENFORCEMENT IS ROLE-INDEPENDENT
--   Constraints are evaluated by the system for every role, so service_role is
--   bound exactly as the table owner is. service_role holds BYPASSRLS, which is
--   not constraint bypass. ALTER TABLE ... ADD CONSTRAINT requires table
--   OWNERSHIP and neither needs nor grants any privilege to service_role, anon or
--   authenticated — the certified ACL posture is unchanged.
--
-- IDEMPOTENT
--   ADD CONSTRAINT has no IF NOT EXISTS, so each addition is guarded by a
--   pg_constraint existence test on the exact constraint name. Re-running this
--   file leaves the same end state. A same-named constraint that already existed
--   with a WRONG definition would be caught by the certification, not silently
--   accepted: this file creates, the certification verifies.
--
-- ATOMIC
--   Both additions share ONE transaction and commit together — the FK depends on
--   the anchor, so a partial state must be impossible.
--
-- EXPECTED RESULT
--   provider_credentials gains exactly:
--     provider_credentials_id_rotation_unit_unique
--       UNIQUE (id, business_connection_id, credential_type)
--     provider_credentials_superseded_same_rotation_unit_fkey
--       FOREIGN KEY (superseded_by_credential_id, business_connection_id, credential_type)
--       REFERENCES public.provider_credentials (id, business_connection_id, credential_type)
--   Certification rows D (foreign keys 6 -> 7) and E (unique constraints 3 -> 4)
--   must be updated in the same change, or a correct deployment reports FAIL.
--
-- ROLLBACK (valid only while no violating rows exist)
--   -- begin;
--   --   alter table public.provider_credentials
--   --     drop constraint if exists provider_credentials_superseded_same_rotation_unit_fkey;
--   --   alter table public.provider_credentials
--   --     drop constraint if exists provider_credentials_id_rotation_unit_unique;
--   -- commit;
-- ============================================================================

begin;

-- ── 1. Same-rotation-unit integrity anchor ──────────────────────────────────
-- An FK target must be a unique constraint on exactly the referenced columns, in
-- the referenced order. Uniqueness is already implied by the primary key, so this
-- exists as a referential destination — never as a data rule that could reject a
-- legitimate row. Mirrors provider_credentials_id_business_unique.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'provider_credentials_id_rotation_unit_unique'
      and conrelid = 'public.provider_credentials'::regclass
  ) then
    alter table public.provider_credentials
      add constraint provider_credentials_id_rotation_unit_unique
      unique (id, business_connection_id, credential_type);
  end if;
end $$;

-- ── 2. Supersession stays inside the rotation unit ──────────────────────────
-- The successor must share the predecessor's business_connection_id AND
-- credential_type, so a cross-connection or cross-type replacement is
-- STRUCTURALLY IMPOSSIBLE — rejected by the database even for service_role.
-- business_id is guaranteed transitively (a credential's business is fixed by its
-- connection) AND directly by the retained
-- provider_credentials_superseded_same_business_fkey.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'provider_credentials_superseded_same_rotation_unit_fkey'
      and conrelid = 'public.provider_credentials'::regclass
  ) then
    alter table public.provider_credentials
      add constraint provider_credentials_superseded_same_rotation_unit_fkey
      foreign key (superseded_by_credential_id, business_connection_id, credential_type)
      references public.provider_credentials (id, business_connection_id, credential_type);
  end if;
end $$;

commit;