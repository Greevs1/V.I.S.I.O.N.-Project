-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-001.1 — SERVICE_ROLE TABLE ACL CORRECTION
-- ============================================================================
-- WHY THIS EXISTS
--   CB-001 was deployed to production and the live certification returned exactly
--   two FAILs — L (service_role = SELECT/INSERT/UPDATE exactly) and N
--   (service_role DELETE = FALSE). Observed on both new tables:
--
--     {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--
--   pg_default_acl materialized FULL table privileges (arwdDxtm = INSERT, SELECT,
--   UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) into relacl at
--   CREATE TABLE time, before CB-001's own statements ran. PostgreSQL table
--   privileges are purely additive per ACL item, so CB-001's
--   GRANT SELECT, INSERT, UPDATE could only add to that set — it could not narrow
--   it. The only statement that removes a privilege is REVOKE, and CB-001 never
--   revoked service_role. This patch issues that revoke.
--
-- SCOPE — privileges only, on exactly two tables.
--   Allowed: REVOKE / GRANT of table privileges on public.business_connections and
--   public.provider_credentials.
--   NOT touched: columns, constraints, indexes, RLS state, policies, functions,
--   triggers, rows, Vault, the Digital Twin fact/evidence/conflict tables, and
--   provider data. postgres owner privileges are explicitly left alone.
--
-- IDEMPOTENT
--   REVOKE ALL against an already-narrowed grant is a no-op, and the GRANT
--   re-asserts the same three privileges. Re-running leaves the same end state.
--
-- ATOMIC
--   Both statements share ONE transaction. A botched ACL state is a lockout, not
--   a warning: if the GRANT fails for any reason, the REVOKE rolls back with it
--   and service_role keeps working. There is no COMMIT between them.
--
-- EXPECTED RESULT
--   service_role:  arwdDxtm  →  arw        (SELECT, INSERT, UPDATE only)
--   postgres:      arwdDxtm  →  arwdDxtm   (unchanged)
--
-- ROLLBACK
--   -- Only if the intended posture is ever deliberately abandoned:
--   -- begin;
--   --   grant all on table public.business_connections, public.provider_credentials to service_role;
--   -- commit;
-- ============================================================================

begin;

revoke all on table public.business_connections, public.provider_credentials from service_role;

grant select, insert, update on table public.business_connections, public.provider_credentials to service_role;

commit;