-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-002 ADVERSARIAL — RESIDUE CHECK (STEP 2 OF 2)
-- ============================================================================
-- READ-ONLY. Run this AFTER phase_cb_002_vault_credential_wrappers_adversarial.sql.
-- It is the verdict for CB2-C1: it measures the live database AFTER that file's
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
-- MUST READ 0 / 0 / 0 / PASS. Anything else means synthetic material survived.
--
-- TWO INDEPENDENT KEYS, BECAUSE THE TWO KINDS OF RESIDUE ARE DIFFERENT SHAPES
--   • Rows are keyed on the reserved connection-id namespace
--     00000000-0000-0000-0000-0000000c02xx that the suite exclusively used.
--   • Vault material cannot be keyed on a row's namespace, because a surviving
--     secret may have lost its row. So material is counted when EITHER
--       (a) it is an orphan — named for a credential uuid that does not exist, or
--       (b) it belongs to a credential whose connection is in the reserved
--           namespace.
--     (a) also catches a partial rollback, which is the one failure a row count
--     alone would miss. This count is therefore correct FOREVER: a real provider
--     secret is neither an orphan nor bound to a synthetic connection, so it is
--     never miscounted.
-- ============================================================================

select
  (select count(*) from public.business_connections
     where id::text like '00000000-0000-0000-0000-0000000c02%') as residual_connections,

  (select count(*) from public.provider_credentials
     where business_connection_id::text like '00000000-0000-0000-0000-0000000c02%') as residual_credentials,

  (select count(*) from vault.secrets s
     where s.name like 'vision-provider-credential:%'
       and (
         not exists (
           select 1 from public.provider_credentials c
            where 'vision-provider-credential:' || c.id::text = s.name)
         or exists (
           select 1 from public.provider_credentials c
            where 'vision-provider-credential:' || c.id::text = s.name
              and c.business_connection_id::text like '00000000-0000-0000-0000-0000000c02%')
       )) as residual_vault_secrets,

  case
    when (select count(*) from public.business_connections
            where id::text like '00000000-0000-0000-0000-0000000c02%') = 0
     and (select count(*) from public.provider_credentials
            where business_connection_id::text like '00000000-0000-0000-0000-0000000c02%') = 0
     and (select count(*) from vault.secrets s
            where s.name like 'vision-provider-credential:%'
              and (
                not exists (
                  select 1 from public.provider_credentials c
                   where 'vision-provider-credential:' || c.id::text = s.name)
                or exists (
                  select 1 from public.provider_credentials c
                   where 'vision-provider-credential:' || c.id::text = s.name
                     and c.business_connection_id::text like '00000000-0000-0000-0000-0000000c02%')
              )) = 0
    then 'PASS'
    else 'FAIL'
  end as cleanup_verdict;