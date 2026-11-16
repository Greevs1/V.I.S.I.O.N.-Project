-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-002.1 ADVERSARIAL — RESIDUE CHECK (STEP 2 OF 2)
-- ============================================================================
-- READ-ONLY. Run this AFTER phase_cb_002_1_rotation_lifecycle_hardening_
-- adversarial.sql. It is the verdict for CB21-C1: it measures the live database
-- AFTER that file's `rollback;` has executed.
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
-- MUST READ 0 / 0 / 0 / 0 / PASS. Anything else means synthetic material survived.
--
-- FOUR INDEPENDENT KEYS, BECAUSE THE KINDS OF RESIDUE ARE DIFFERENT SHAPES
--   · Rows are keyed on the reserved connection-id namespace
--     00000000-0000-0000-0000-0000000c21xx that the suite exclusively used.
--   · Vault material cannot be keyed on a row's namespace alone, because a
--     surviving secret may have lost its row. So material is counted when EITHER
--       (a) it is an orphan — named for a credential uuid that does not exist, or
--       (b) it belongs to a credential whose connection is in the reserved
--           namespace.
--     (a) also catches a partial rollback, which is the one failure a row count
--     alone would miss. This count is therefore correct FOREVER: a real provider
--     secret is neither an orphan nor bound to a synthetic connection, so it is
--     never miscounted.
--   · Authorization attempts are keyed on the CB-002.1 synthetic digest
--     byte-pair. This phase creates NONE — the row exists so that a future edit
--     cannot start creating them silently.
--
-- THE DIGITAL TWIN FREEZE IS MEASURED HERE TOO
--   The fact tables are re-read after the rollback: the freeze must still read
--   0 / 0 / 0. This phase never writes them; the measurement is what makes that
--   a fact rather than a claim.
-- ============================================================================

select
  (select count(*) from public.business_connections
     where id::text like '00000000-0000-0000-0000-0000000c21%') as residual_connections,

  (select count(*) from public.provider_credentials
     where business_connection_id::text like '00000000-0000-0000-0000-0000000c21%') as residual_credentials,

  (select count(*) from vault.secrets s
     where s.name like 'vision-provider-credential:%'
       and (
         not exists (
           select 1 from public.provider_credentials c
            where 'vision-provider-credential:' || c.id::text = s.name)
         or exists (
           select 1 from public.provider_credentials c
            where 'vision-provider-credential:' || c.id::text = s.name
              and c.business_connection_id::text like '00000000-0000-0000-0000-0000000c21%')
       )) as residual_vault_secrets,

  (select count(*) from public.provider_authorization_attempts a
     where a.state_hash ~ '^(21)\1{31}$') as residual_attempts,

  (select count(*) from public.business_facts)          as fact_rows,
  (select count(*) from public.business_fact_evidence)  as fact_evidence_rows,
  (select count(*) from public.business_fact_conflicts) as fact_conflict_rows,

  case
    when (select count(*) from public.business_connections
            where id::text like '00000000-0000-0000-0000-0000000c21%') = 0
     and (select count(*) from public.provider_credentials
            where business_connection_id::text like '00000000-0000-0000-0000-0000000c21%') = 0
     and (select count(*) from vault.secrets s
            where s.name like 'vision-provider-credential:%'
              and (
                not exists (
                  select 1 from public.provider_credentials c
                   where 'vision-provider-credential:' || c.id::text = s.name)
                or exists (
                  select 1 from public.provider_credentials c
                   where 'vision-provider-credential:' || c.id::text = s.name
                     and c.business_connection_id::text like '00000000-0000-0000-0000-0000000c21%')
              )) = 0
     and (select count(*) from public.provider_authorization_attempts a
            where a.state_hash ~ '^(21)\1{31}$') = 0
     and (select count(*) from public.business_facts) = 0
     and (select count(*) from public.business_fact_evidence) = 0
     and (select count(*) from public.business_fact_conflicts) = 0
    then 'PASS'
    else 'FAIL'
  end as cleanup_verdict;