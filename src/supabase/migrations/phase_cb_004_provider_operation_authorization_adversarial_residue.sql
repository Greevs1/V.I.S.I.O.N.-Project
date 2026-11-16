-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-004 ADVERSARIAL — RESIDUE CHECK (STEP 2 OF 2)
-- ============================================================================
-- READ-ONLY. Run this AFTER
-- phase_cb_004_provider_operation_authorization_adversarial.sql.
-- It is the verdict for CB4-C1: it measures the live database AFTER that file's
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
--
-- MUST READ 0 / 0 / 0 / 0 / PASS. Anything else means synthetic material survived.
--
-- THREE INDEPENDENT KEYS, BECAUSE THE KINDS OF RESIDUE ARE DIFFERENT SHAPES
--   · Audit rows are keyed on the reserved CB-004 correlation prefix. This is the
--     shape THIS phase can leave behind, and it is the one that matters most: an
--     audit row is evidence, so a synthetic one is evidence of nothing.
--   · Connections are keyed on the reserved namespace 00000000-…-0000000c04xx,
--     which no other Connected Business phase uses (CB-001/002 used 0c00xx/0c02xx,
--     CB-003 0c03xx, CB-002.1 0c21xx). CB-004 creates none — the row is counted so
--     that a future edit cannot silently start creating them.
--   · Vault material is counted for those connections specifically. CB-004 performs
--     NO Vault access at all, so the honest expectation for this phase is zero —
--     and the count is what makes that a measurement rather than a claim.
--
-- THE DIGITAL TWIN FREEZE IS MEASURED HERE TOO
--   Re-read after the rollback: the freeze must still read 0 / 0 / 0, and the
--   provider credential baseline must still read 0 connections / 0 credentials.
--   This phase never writes them; the measurement is what makes that a fact
--   rather than a claim.
-- ============================================================================

select
  (select count(*) from public.provider_operation_audit
     where request_correlation_id like 'vision_test_corr_cb004_%') as residual_audit_rows,

  (select count(*) from public.business_connections
     where id::text like '00000000-0000-0000-0000-0000000c04%') as residual_connections,

  (select count(*) from vault.secrets s
     where exists (
       select 1 from public.provider_credentials c
        where 'vision-provider-credential:' || c.id::text = s.name
          and c.business_connection_id::text like '00000000-0000-0000-0000-0000000c04%')
  ) as residual_vault_secrets,

  (select count(*) from public.business_facts)          as fact_rows,
  (select count(*) from public.business_fact_evidence)  as fact_evidence_rows,
  (select count(*) from public.business_fact_conflicts) as fact_conflict_rows,

  (select count(*) from public.business_connections) as connection_rows,
  (select count(*) from public.provider_credentials) as credential_rows,

  case
    when (select count(*) from public.provider_operation_audit
            where request_correlation_id like 'vision_test_corr_cb004_%') = 0
     and (select count(*) from public.business_connections
            where id::text like '00000000-0000-0000-0000-0000000c04%') = 0
     and (select count(*) from public.business_facts) = 0
     and (select count(*) from public.business_fact_evidence) = 0
     and (select count(*) from public.business_fact_conflicts) = 0
    then 'PASS'
    else 'FAIL'
  end as cleanup_verdict;