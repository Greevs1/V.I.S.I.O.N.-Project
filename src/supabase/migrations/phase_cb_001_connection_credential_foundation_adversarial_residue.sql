-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-001 ADVERSARIAL — RESIDUE CHECK (STEP 2 OF 2)
-- ============================================================================
-- READ-ONLY. Run this AFTER phase_cb_001_connection_credential_foundation_adversarial.sql.
-- It is the verdict for T11: it measures the live tables after that file's
-- `rollback;` has executed.
--
-- WHY THIS IS A SEPARATE FILE
--   The SQL editor surfaces ONE result grid per execution — the last statement
--   that returned rows. The verdict grid must be produced BEFORE the rollback,
--   and this measurement must run AFTER it, so the two cannot share a single
--   execution without something carrying data across the rollback. A temporary
--   table cannot do that: its rows — and, when it is created inside the
--   transaction, the table itself — are undone by ROLLBACK.
--
--   Nothing is weakened by the split. This step performs NO writes, opens NO
--   transaction, creates NO object, and cannot commit anything. The adversarial
--   file keeps its unconditional `rollback;` as its final statement.
--
-- MUST READ 0 / 0 / PASS. Anything else means synthetic rows survived.
--
-- Keyed on the reserved connection-id namespace, NOT on metadata: every synthetic
-- row the suite creates — including T10's, whose metadata is ordinary rotation
-- bookkeeping — is inside 00000000-0000-0000-0000-0000000c00xx.
-- ============================================================================

select
  (select count(*) from public.business_connections
     where id::text like '00000000-0000-0000-0000-0000000c%') as residual_connections,
  (select count(*) from public.provider_credentials
     where business_connection_id::text like '00000000-0000-0000-0000-0000000c%') as residual_credentials,
  case
    when (select count(*) from public.business_connections
            where id::text like '00000000-0000-0000-0000-0000000c%') = 0
     and (select count(*) from public.provider_credentials
            where business_connection_id::text like '00000000-0000-0000-0000-0000000c%') = 0
    then 'PASS'
    else 'FAIL'
  end as cleanup_verdict;