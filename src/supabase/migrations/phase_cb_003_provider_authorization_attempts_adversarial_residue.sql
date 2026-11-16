-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-003 ADVERSARIAL — RESIDUE CHECK (STEP 2 OF 2)
-- ============================================================================
-- READ-ONLY. Run this AFTER phase_cb_003_provider_authorization_attempts_adversarial.sql.
-- It is the verdict for CB3-C1: it measures the live database AFTER that file's
-- `rollback;` has executed.
--
-- WHY THIS IS A SEPARATE FILE
--   The SQL editor surfaces ONE result grid per execution — the last statement
--   that returned rows. The verdict grid must be produced BEFORE the rollback and
--   this measurement AFTER it, so the two cannot share one execution without
--   something carrying state across the rollback. A temporary table cannot do
--   that: its rows, and the table itself, are undone by ROLLBACK.
--
--   Nothing is weakened by the split. This step performs NO writes, opens NO
--   transaction, creates NO object, destroys NOTHING and cannot commit anything.
--   The adversarial file keeps its unconditional `rollback;` as its final
--   statement.
--
-- MUST READ 0 / 0 / PASS. Anything else means synthetic material survived.
--
-- TWO INDEPENDENT KEYS, BECAUSE THE TWO KINDS OF RESIDUE ARE DIFFERENT SHAPES
--   • Connections are keyed on the reserved id namespace
--     00000000-0000-0000-0000-0000000c03xx that the suite exclusively used.
--   • Attempts cannot be keyed on an id namespace: the creation function
--     GENERATES the id, so a synthetic attempt deliberately does not get a
--     synthetic id. They are keyed on the DIGEST instead — every synthetic digest
--     is a single hex byte-pair repeated 32 times, i.e. repeat('XX', 32).
--     A real SHA-256 digest has 32 independent byte-pairs, so it satisfies that
--     pattern only with probability ~16^-31 — which is why this key is correct
--     FOREVER and never miscounts a real authorization attempt, including a
--     partially rolled back one whose row survived but whose siblings did not.
--
-- ALSO REPORTED: the table's total row count, so a reviewer can see at a glance
--   that nothing at all was left behind — and, once real flows exist, that the
--   number is explained by real attempts rather than by residue.
-- ============================================================================

select
  (select count(*) from public.provider_authorization_attempts a
     where a.state_hash ~ '^([0-9a-f]{2})\1{31}$') as residual_attempts,

  (select count(*) from public.business_connections c
     where c.id::text like '00000000-0000-0000-0000-0000000c03%') as residual_connections,

  (select count(*) from public.provider_authorization_attempts) as total_attempts_in_table,

  case
    when (select count(*) from public.provider_authorization_attempts a
            where a.state_hash ~ '^([0-9a-f]{2})\1{31}$') = 0
     and (select count(*) from public.business_connections c
            where c.id::text like '00000000-0000-0000-0000-0000000c03%') = 0
    then 'PASS'
    else 'FAIL'
  end as cleanup_verdict;