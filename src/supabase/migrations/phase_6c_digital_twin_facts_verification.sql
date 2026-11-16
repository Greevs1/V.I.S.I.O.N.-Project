-- ═════════════════════════════════════════════════════════════════════════════
-- PHASE 6C — DIGITAL TWIN FACTS + EVIDENCE — VERIFICATION & TEST HARNESS
--
-- ███  NOT EXECUTED. PREPARED FOR REVIEW. DO NOT RUN WITHOUT EXPLICIT APPROVAL. ███
--
-- STATUS: NOT EXECUTED
-- REVISION 3 — packaging split. SEMANTICS UNCHANGED from approved revision 3.
--
-- COMPANION TO: src/supabase/migrations/phase_6c_digital_twin_facts.sql
--   · That file performs the atomic installation (one BEGIN … COMMIT). It holds no
--     verification queries and no behavioural tests.
--   · THIS file holds NO installation DDL: only read-only verification (V1–V9) and
--     transactional behavioural tests (every block BEGIN … ROLLBACK).
--
-- HOW TO RUN
--   1. Run the installation file first; confirm COMMIT succeeded.
--   2. Run SECTION V — read-only, safe to run repeatedly. Check every expectation.
--   3. Run SECTION T block by block (or whole). EVERY block ends in ROLLBACK, so the
--      database is left exactly as it was. Blocks that fail on purpose abort their
--      transaction: issue a bare `rollback;` if your editor halts at the error.
--   4. SECTION L is MANUAL — it needs two authenticated users on two businesses.
--
-- SUBSTITUTE BEFORE RUNNING
--   :'biz'      → a real business_entities.id (Business A)
--   :'biz_b'    → a DIFFERENT real business_entities.id (Business B)
--   :'profile'  → a real profiles.id
--
-- NOTHING HERE MUTATES LASTING STATE. Verification queries only read; every
-- behavioural test rolls back.
-- ═════════════════════════════════════════════════════════════════════════════


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION V — VERIFICATION (read-only). Run immediately after applying.
-- ═════════════════════════════════════════════════════════════════════════════

-- V1. Tables exist, RLS enabled, read policy exactly one, write policies exactly zero.
--     Expected: rls_enabled = true (both), read_policy_count = 1 (both), write_policy_count = 0 (both).
select c.relname,
       c.relrowsecurity                                     as rls_enabled,
       (select count(*) from pg_policy p where p.polrelid = c.oid and p.polcmd = 'r') as read_policy_count,
       (select count(*) from pg_policy p where p.polrelid = c.oid and p.polcmd in ('a','w','d')) as write_policy_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('business_facts','business_fact_evidence');

-- V2. Indexes present. Expected: 9 rows —
--     business_facts_fingerprint_unique, business_facts_id_business_unique (both from
--     unique constraints), idx_business_facts_resolver, idx_business_facts_verification,
--     idx_business_facts_provenance, idx_business_facts_supersedes,
--     idx_fact_evidence_fact, idx_fact_evidence_source, idx_fact_evidence_document.
select indexname, indexdef from pg_indexes
 where schemaname = 'public' and tablename in ('business_facts','business_fact_evidence')
 order by indexname;

-- V3. Guard trigger (INSERT + UPDATE) and guard function installed.
--     Expected: one row, tgenabled = 'O', definition contains 'BEFORE INSERT OR UPDATE'.
select tgname, tgenabled, pg_get_triggerdef(t.oid) as definition
  from pg_trigger t
 where t.tgrelid = 'public.business_facts'::regclass and not t.tgisinternal;
select proname from pg_proc
 where proname = 'business_facts_append_only' and pronamespace = 'public'::regnamespace;

-- V4. NOTHING migrated: both tables empty. Expected: 0 and 0.
select (select count(*) from public.business_facts) as facts,
       (select count(*) from public.business_fact_evidence) as evidence;

-- V5. Conflict view exists and is empty. Expected: 0 rows.
select * from public.business_fact_conflicts limit 5;

-- V6. Uniqueness: exactly TWO unique constraints — fingerprint (fact identity) and
--     (id, business_id) (composite-FK support). And explicitly NO (business_id, fact_key).
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint where conrelid = 'public.business_facts'::regclass and contype = 'u' order by conname;
select count(*) as business_key_unique_constraints
  from pg_constraint
 where conrelid = 'public.business_facts'::regclass and contype = 'u'
   and pg_get_constraintdef(oid) ilike '%(business_id, fact_key)%';

-- V7. All CHECK constraints on business_facts (the verification / confirmation /
--     supersession semantics) and on the evidence table. Expected: 26 CHECK
--     constraints on business_facts — 18 named (value_shape, 2 self-supersession,
--     9 verification identity, 2 confirmed + 1 rejected + 1 review timestamp,
--     superseded_needs_reason, superseded_consistent) plus 8 inline column checks
--     (value_type, period_type, accounting_basis, source_type, confidence,
--     verification_status, verification_method, source_status) — and 5 on
--     business_fact_evidence (2 named: document_ref_shape, deleted_shape; plus
--     3 inline: evidence_type, confidence, source_status).
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint where conrelid = 'public.business_facts'::regclass and contype = 'c' order by conname;
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint where conrelid = 'public.business_fact_evidence'::regclass and contype = 'c' order by conname;

-- V8. Same-business integrity FKs. Expected: 5 rows —
--     business_facts_business_id_fkey (scope),
--     business_facts_supersedes_same_business_fk, business_facts_superseded_by_same_business_fk,
--     business_fact_evidence_fact_business_fk, business_fact_evidence_business_fk.
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid in ('public.business_facts'::regclass, 'public.business_fact_evidence'::regclass)
   and contype = 'f' order by conrelid::regclass::text, conname;

-- V9. Verification vocabulary — no legacy 'unverified' state, and the system
--     attestation identities are the approved set.
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.business_facts'::regclass
   and conname in ('business_facts_verification_status_check','business_facts_verified_by_service_vocab')
 order by conname;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION T — BEHAVIOURAL TESTS (NON-DESTRUCTIVE: every test ends in ROLLBACK).
--
-- Substitute before running:
--   :'biz'      → a real business_entities.id (Business A)
--   :'biz_b'    → a DIFFERENT real business_entities.id (Business B)
--   :'profile'  → a real profiles.id
-- Some blocks FAIL on purpose (that is the pass condition). After a failed
-- statement the transaction is aborted; issue a bare `rollback;` afterwards if the
-- editor halts at the error.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── TEST E1 — evidence may NOT claim a different business than its fact ──────
-- Expected: ERROR — composite FK business_fact_evidence_fact_business_fk violated.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,95,'extraction_confidence','proposed','tE1-fact');

insert into public.business_fact_evidence (fact_id, business_id, evidence_type, value_as_stated)
select id, :'biz_b', 'document', '5,200,000'
  from public.business_facts where fingerprint = 'tE1-fact';
rollback;

-- ── TEST E2 — evidence on its own fact's business ───────────────────────────
-- Expected: PASS — 1 evidence row, business_id identical to the fact's.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,95,'extraction_confidence','proposed','tE2-fact');

insert into public.business_fact_evidence (fact_id, business_id, evidence_type, value_as_stated)
select id, business_id, 'document', '5,200,000'
  from public.business_facts where fingerprint = 'tE2-fact';

select count(*) as evidence_rows, count(distinct business_id) as distinct_businesses
  from public.business_fact_evidence;
rollback;

-- ── TEST A/B — periods coexist, never conflict ───────────────────────────────
-- FY2024 + FY2025 + TTM. Expected: 3 facts; 0 conflicts.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label, fiscal_year,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, reviewed_by_profile_id, reviewed_at, fingerprint)
values
  (:'biz','revenue','financial','currency',4400000,'USD','fiscal_year','FY2024',2024,'accrual',
   'document_extraction',2,92,'extraction_confidence','confirmed','document_review_accept',:'profile',now(),'tA-fy2024'),
  (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025',2025,'accrual',
   'document_extraction',2,92,'extraction_confidence','confirmed','document_review_accept',:'profile',now(),'tA-fy2025'),
  (:'biz','revenue','financial','currency',5600000,'USD','trailing_twelve_months','TTM',null,'accrual',
   'document_extraction',2,90,'extraction_confidence','confirmed','document_review_accept',:'profile',now(),'tA-ttm');
select count(*) as coexisting from public.business_facts where business_id = :'biz';
select count(*) as conflicts from public.business_fact_conflicts where business_id = :'biz';
rollback;

-- ── TEST D/E — different facts never conflict ────────────────────────────────
-- Expected: 0 conflicts.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, reviewed_by_profile_id, reviewed_at,
   verified_by_profile_id, verified_at, fingerprint)
values
  (:'biz','reported_ebitda','financial','currency',1000000,'USD','fiscal_year','FY2025','accrual','document_extraction',2,90,'extraction_confidence','verified','advisor_review',:'profile',now(),:'profile',now(),'tD-ebitda'),
  (:'biz','normalized_ebitda','financial','currency',1250000,'USD','fiscal_year','FY2025','accrual','derived_calculation',9,80,'calculated','proposed',null,null,null,null,null,'tD-nebitda'),
  (:'biz','net_income','financial','currency',600000,'USD','fiscal_year','FY2025','accrual','document_extraction',2,90,'extraction_confidence','verified','expert_review',:'profile',now(),:'profile',now(),'tD-netincome'),
  (:'biz','gross_margin','financial','percentage',38.4,'%','fiscal_year','FY2025','accrual','document_extraction',2,90,'extraction_confidence','confirmed','document_review_accept',:'profile',now(),null,null,'tE-gm');
select count(*) as conflicts from public.business_fact_conflicts where business_id = :'biz';
rollback;

-- ── TEST F — cash vs accrual revenue: both preserved, no conflict ────────────
-- Expected: 0 conflicts; 2 facts with different accounting_basis.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, reviewed_by_profile_id, reviewed_at, fingerprint)
values
  (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual','document_extraction',
   2,95,'extraction_confidence','confirmed','document_review_accept',:'profile',now(),'tF-accrual'),
  (:'biz','revenue','financial','currency',4900000,'USD','fiscal_year','FY2025','cash','owner_reported',
   8,50,'source_reported','confirmed','owner_confirmation',:'profile',now(),'tF-cash');
select count(*) as conflicts from public.business_fact_conflicts where business_id = :'biz';
select accounting_basis, value_numeric from public.business_facts where business_id = :'biz' order by accounting_basis;
rollback;

-- ── TEST C1 — materially different compatible observations → conflict RETAINED
-- Expected: 1 conflict row, candidate_count = 2, spread ≈ 10.3, both facts present.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label, fiscal_year,
   period_start, period_end, accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, reviewed_by_profile_id, reviewed_at, fingerprint)
values
  (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025',2025,date '2025-01-01',date '2025-12-31','accrual','document_extraction',2,95,'extraction_confidence','confirmed','document_review_accept',:'profile',now(),'tC-pnl'),
  (:'biz','revenue','financial','currency',5800000,'USD','fiscal_year','FY2025',2025,date '2025-01-01',date '2025-12-31','accrual','owner_reported',8,40,'source_reported','confirmed','owner_confirmation',:'profile',now(),'tC-owner');
select candidate_count, min_value, max_value, spread_percentage from public.business_fact_conflicts where business_id = :'biz';
select count(*) as still_two_facts from public.business_facts where business_id = :'biz';
rollback;

-- ── TEST C2 — BELOW the 5% threshold: still retained, still listed ───────────
-- Expected: 1 conflict row, spread ≈ 0.19; 2 facts stored.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label, fiscal_year,
   period_start, period_end, accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, reviewed_by_profile_id, reviewed_at, fingerprint)
values
  (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025',2025,date '2025-01-01',date '2025-12-31','accrual','document_extraction',2,95,'extraction_confidence','confirmed','document_review_accept',:'profile',now(),'tC2-pnl'),
  (:'biz','revenue','financial','currency',5210000,'USD','fiscal_year','FY2025',2025,date '2025-01-01',date '2025-12-31','accrual','owner_reported',8,40,'source_reported','confirmed','owner_confirmation',:'profile',now(),'tC2-owner');
select candidate_count, spread_percentage from public.business_fact_conflicts where business_id = :'biz';
select count(*) as still_two_facts from public.business_facts where business_id = :'biz';
rollback;

-- ── TEST C3 (ISSUE 4) — a third same-label observation with DIFFERENT bounds must
-- NOT suppress the A/B conflict. C stays stored as its own identity.
-- Expected: exactly 1 conflict group with candidate_count = 2 (the same-bound pair);
--           3 facts stored; C's bounds appear as their own group only if it conflicts
--           with something (it does not).
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label, fiscal_year,
   period_start, period_end, accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, reviewed_by_profile_id, reviewed_at, fingerprint)
values
  (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025',2025,date '2025-01-01',date '2025-12-31','accrual',
   'document_extraction',2,95,'extraction_confidence','confirmed','document_review_accept',:'profile',now(),'tC3-a'),
  (:'biz','revenue','financial','currency',5800000,'USD','fiscal_year','FY2025',2025,date '2025-01-01',date '2025-12-31','accrual',
   'owner_reported',8,40,'source_reported','confirmed','owner_confirmation',:'profile',now(),'tC3-b'),
  (:'biz','revenue','financial','currency',5500000,'USD','fiscal_year','FY2025',2025,date '2025-02-01',date '2025-11-30','accrual',
   'advisor_entry',5,70,'source_reported','confirmed','owner_confirmation',:'profile',now(),'tC3-c');
select candidate_count, min_value, max_value, period_start_key, period_end_key
  from public.business_fact_conflicts where business_id = :'biz';
select count(*) as conflicts_reported from public.business_fact_conflicts where business_id = :'biz';
select count(*) as all_three_stored from public.business_facts where business_id = :'biz';
rollback;

-- ── TEST C4 (ISSUE 4) — same label, genuinely different bounds → NOT a conflict
-- Expected: 0 conflict rows, 2 facts stored.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label, fiscal_year,
   period_start, period_end, accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, reviewed_by_profile_id, reviewed_at, fingerprint)
values
  (:'biz','revenue','financial','currency',5200000,'USD','custom_period','Q1-Q3 2025',2025,date '2025-01-01',date '2025-09-30','accrual',
   'document_extraction',2,95,'extraction_confidence','confirmed','document_review_accept',:'profile',now(),'tC4-a'),
  (:'biz','revenue','financial','currency',5800000,'USD','custom_period','Q1-Q3 2025',2025,date '2025-02-01',date '2025-10-31','accrual',
   'owner_reported',8,40,'source_reported','confirmed','owner_confirmation',:'profile',now(),'tC4-b');
select count(*) as conflicts_reported from public.business_fact_conflicts where business_id = :'biz';
select count(*) as both_stored from public.business_facts where business_id = :'biz';
rollback;

-- ── TEST H — idempotent reprocessing of the SAME observation ────────────────
-- Expected: the identical re-insert raises a duplicate-key error on fingerprint.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, source_table, source_id, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,'extracted_fields','field-1',88,'extraction_confidence','proposed','tH-original');

insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, source_table, source_id, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,'extracted_fields','field-1',88,'extraction_confidence','proposed','tH-original');
rollback;

-- ── TEST I — correction appends a new fact and supersedes the old one ───────
-- Expected: the AI value is retained and marked superseded; the corrected value is
-- a separate fact set to 'confirmed'.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, source_table, source_id, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,'extracted_fields','field-1',88,'extraction_confidence','proposed','tI-original');

insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, source_table, source_id, source_reference,
   confidence, confidence_basis, verification_status, verification_method, reviewed_by_profile_id, reviewed_at,
   supersedes_fact_id, fingerprint)
values (:'biz','revenue','financial','currency',5400000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,'extracted_fields','field-1',
   '{"correction_event":"corrected","original_value":"5200000","extracted_field_id":"field-1"}'::jsonb,
   null,'human_review','confirmed','document_review_correction',:'profile',now(),
   (select id from public.business_facts where fingerprint = 'tI-original'), 'tI-corrected');

update public.business_facts
   set verification_status = 'superseded', superseded_at = now(),
       supersession_reason = 'corrected by human review',
       superseded_by_fact_id = (select id from public.business_facts where fingerprint = 'tI-corrected')
 where fingerprint = 'tI-original';

select fingerprint, verification_status, superseded_at is not null as superseded,
       supersedes_fact_id is not null as supersedes
  from public.business_facts where business_id = :'biz' order by created_at;
rollback;

-- ── TEST P1 — append-only: rewriting a VALUE must FAIL ──────────────────────
-- Expected: ERROR restrict_violation.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,90,'extraction_confidence','proposed','tP1-guard');
update public.business_facts set value_numeric = 9999999 where fingerprint = 'tP1-guard';
rollback;

-- ── TEST P2 — rewriting BASIS / PERIOD / SOURCE identity must FAIL ───────────
-- Expected: ERROR restrict_violation.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,90,'extraction_confidence','proposed','tP2-guard');
update public.business_facts set accounting_basis = 'cash' where fingerprint = 'tP2-guard';
rollback;

-- ── TEST Q1 — human Accept → confirmed (NOT verified) ───────────────────────
-- Expected: verification_status = 'confirmed', method document_review_accept,
--           verified_* still null.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','net_income','financial','currency',600000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,91,'extraction_confidence','proposed','tQ1-base');
update public.business_facts
   set verification_status = 'confirmed', verification_method = 'document_review_accept',
       reviewed_by_profile_id = :'profile', reviewed_at = now()
 where fingerprint = 'tQ1-base';
select verification_status, verification_method, reviewed_by_profile_id is not null as has_reviewer,
       verified_by_profile_id is null as no_attestation
  from public.business_facts where fingerprint = 'tQ1-base';
rollback;

-- ── TEST Q2 — proper human attestation → verified ───────────────────────────
-- Expected: verification_status = 'verified', method advisor_review, verifier recorded.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','net_income','financial','currency',600000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,91,'extraction_confidence','proposed','tQ2-base');
update public.business_facts
   set verification_status = 'verified', verification_method = 'advisor_review',
       verified_by_profile_id = :'profile', verified_at = now()
 where fingerprint = 'tQ2-base';
select verification_status, verification_method, verified_by_profile_id is not null as human_attested
  from public.business_facts where fingerprint = 'tQ2-base';
rollback;

-- ── TEST Q5 — UPDATE to verified with a non-attestation method must FAIL ─────
-- Expected: ERROR — business_facts_verified_method_required (CHECK on UPDATE).
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','cash','financial','currency',250000,'USD','point_in_time','As of 2026-08-07','unknown',
   'manual_entry',8,60,'source_reported','proposed','tQ5-bad');
update public.business_facts
   set verification_status = 'verified', verification_method = 'document_review_accept',
       verified_by_profile_id = :'profile', verified_at = now()
 where fingerprint = 'tQ5-bad';
rollback;

-- ── TEST Q6 (ISSUE 2) — INSERT verified + document_review_accept must FAIL ───
-- Expected: ERROR — business_facts_verified_method_required on INSERT.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, verified_by_profile_id, verified_at, fingerprint)
values (:'biz','cash','financial','currency',250000,'USD','point_in_time','As of 2026-08-07','unknown',
   'manual_entry',8,60,'source_reported','verified','document_review_accept',:'profile',now(),'tQ6-bad');
rollback;

-- ── TEST Q7 (ISSUE 2) — INSERT verified + advisor_review with NO human must FAIL
-- Expected: ERROR — verified_requires_attestation / verified_human_needs_profile.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, verified_at, fingerprint)
values (:'biz','cash','financial','currency',250000,'USD','point_in_time','As of 2026-08-07','unknown',
   'manual_entry',8,60,'source_reported','verified','advisor_review',now(),'tQ7-bad');
rollback;

-- ── TEST Q8 (ISSUE 2) — INSERT verified + advisor_review + human verifier → PASS
-- Expected: 1 row inserted with the human attestation recorded.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, verified_by_profile_id, verified_at, fingerprint)
values (:'biz','cash','financial','currency',250000,'USD','point_in_time','As of 2026-08-07','unknown',
   'document_extraction',2,88,'extraction_confidence','verified','advisor_review',:'profile',now(),'tQ8-ok');
select verification_status, verification_method, verified_by_profile_id is not null as human_attested,
       verified_by_service is null as no_service_identity
  from public.business_facts where fingerprint = 'tQ8-ok';
rollback;

-- ── TEST Q9 (ISSUE 2) — INSERT verified + connected_source with a SYSTEM identity
-- → PASS, with NO human profile invented.
-- Expected: 1 row, verified_by_service = 'connected_accounting', verified_by_profile_id IS NULL.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, source_table, source_id,
   confidence, confidence_basis, verification_status, verification_method, verified_by_service, verified_at, fingerprint)
values (:'biz','revenue','financial','currency',5300000,'USD','fiscal_year','FY2025','accrual',
   'connected_accounting',1,'connected_accounting_snapshots','qb-trial-balance-2025',
   99,'source_reported','verified','connected_source','connected_accounting',now(),'tQ9-system');
select verification_status, verification_method, verified_by_service,
       verified_by_profile_id is null as no_human_invented
  from public.business_facts where fingerprint = 'tQ9-system';
rollback;

-- ── TEST Q10 (ISSUE 2) — connected_source with NO system identity must FAIL ──
-- Expected: ERROR — business_facts_verified_source_needs_service.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, source_table, source_id,
   confidence, confidence_basis, verification_status, verification_method, verified_at, fingerprint)
values (:'biz','revenue','financial','currency',5300000,'USD','fiscal_year','FY2025','accrual',
   'connected_accounting',1,'connected_accounting_snapshots','qb-trial-balance-2025',
   99,'source_reported','verified','connected_source',now(),'tQ10-bad');
rollback;

-- ── TEST Q10b (ISSUE 2) — connected_source with an INVALID/ MISM  ATCHED system
-- identity must FAIL. Expected: ERROR — verified_by_service_vocab or service/method alignment.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, source_table, source_id,
   confidence, confidence_basis, verification_status, verification_method, verified_by_service, verified_at, fingerprint)
values (:'biz','revenue','financial','currency',5300000,'USD','fiscal_year','FY2025','accrual',
   'connected_accounting',1,'connected_accounting_snapshots','qb-trial-balance-2025',
   99,'source_reported','verified','connected_source','authoritative_filing',now(),'tQ10b-bad');
rollback;

-- ── TEST Q11 (ISSUE 2) — connected_source with NO provenance must FAIL ───────
-- Expected: ERROR — business_facts_verified_provenance_required.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, verification_method, verified_by_service, verified_at, fingerprint)
values (:'biz','revenue','financial','currency',5300000,'USD','fiscal_year','FY2025','accrual',
   'connected_accounting',1,99,'source_reported','verified','connected_source','connected_accounting',now(),'tQ11-bad');
rollback;

-- ── TEST Q12 (ISSUE 2) — legacy migration: service identity + named legacy record
-- → PASS. Expected: 1 row with verified_by_service = 'legacy_migration'.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, source_table, source_id, source_reference,
   confidence, confidence_basis, verification_status, verification_method, verified_by_service, verified_at, fingerprint)
values (:'biz','revenue','financial','currency',4800000,'USD','fiscal_year','FY2024','unknown',
   'system_migration',6,'dashboard_metrics','dm-2024','{"legacy_table":"dashboard_metrics","legacy_id":"dm-2024"}'::jsonb,
   null,'source_reported','verified','legacy_migration','legacy_migration',now(),'tQ12-legacy');
select verification_status, verification_method, verified_by_service,
       source_reference is not null as names_legacy_record
  from public.business_facts where fingerprint = 'tQ12-legacy';
rollback;

-- ── TEST Q13 (ISSUE 2) — a fact cannot INSERT as superseded ─────────────────
-- Expected: ERROR restrict_violation from the guard trigger.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, superseded_at, supersession_reason, fingerprint)
values (:'biz','cash','financial','currency',250000,'USD','point_in_time','As of 2026-08-07','unknown',
   'manual_entry',8,60,'source_reported','superseded',now(),'created superseded','tQ13-bad');
rollback;

-- ── TEST Q14 — supersession without a reason must FAIL ──────────────────────
-- Expected: ERROR — business_facts_superseded_needs_reason.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','cash','financial','currency',250000,'USD','point_in_time','As of 2026-08-07','unknown',
   'manual_entry',8,60,'source_reported','proposed','tQ14-reason');
update public.business_facts
   set verification_status = 'superseded', superseded_at = now()
 where fingerprint = 'tQ14-reason';
rollback;

-- ── TEST S1 (ISSUE 3) — a fact supersedes another fact of the SAME business → PASS
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','debt','financial','currency',900000,'USD','point_in_time','As of 2026-08-07','unknown',
   'owner_reported',8,50,'source_reported','proposed','tS1-old');

insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, supersedes_fact_id, fingerprint)
values (:'biz','debt','financial','currency',875000,'USD','point_in_time','As of 2026-09-30','unknown',
   'owner_reported',8,60,'source_reported','proposed',
   (select id from public.business_facts where fingerprint = 'tS1-old'), 'tS1-new');

update public.business_facts
   set verification_status = 'superseded', superseded_at = now(),
       supersession_reason = 'replaced by a reviewed statement',
       superseded_by_fact_id = (select id from public.business_facts where fingerprint = 'tS1-new')
 where fingerprint = 'tS1-old';

select fingerprint, verification_status,
       supersedes_fact_id is not null as supersedes, superseded_by_fact_id is not null as superseded_by
  from public.business_facts where business_id = :'biz' order by created_at;
rollback;

-- ── TEST S2 (ISSUE 3) — a fact may NOT supersede another business's fact ────
-- Expected: ERROR — composite FK business_facts_supersedes_same_business_fk.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz_b','debt','financial','currency',900000,'USD','point_in_time','As of 2026-08-07','unknown',
   'owner_reported',8,50,'source_reported','proposed','tS2-b-fact');

insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, supersedes_fact_id, fingerprint)
values (:'biz','debt','financial','currency',875000,'USD','point_in_time','As of 2026-09-30','unknown',
   'owner_reported',8,60,'source_reported','proposed',
   (select id from public.business_facts where fingerprint = 'tS2-b-fact'), 'tS2-cross');
rollback;

-- ── TEST S3 (ISSUE 3) — superseded_by may NOT point at another business's fact
-- Expected: ERROR — composite FK business_facts_superseded_by_same_business_fk.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','debt','financial','currency',900000,'USD','point_in_time','As of 2026-08-07','unknown',
   'owner_reported',8,50,'source_reported','proposed','tS3-a-fact');

insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz_b','debt','financial','currency',875000,'USD','point_in_time','As of 2026-09-30','unknown',
   'owner_reported',8,60,'source_reported','proposed','tS3-b-fact');

update public.business_facts
   set verification_status = 'superseded', superseded_at = now(),
       supersession_reason = 'attempted cross-business lineage',
       superseded_by_fact_id = (select id from public.business_facts where fingerprint = 'tS3-b-fact')
 where fingerprint = 'tS3-a-fact';
rollback;

-- ── TEST S4 — supersession is terminal ─────────────────────────────────────
-- Expected: ERROR on the un-supersede statement.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','debt','financial','currency',900000,'USD','point_in_time','As of 2026-08-07','unknown',
   'owner_reported',8,50,'source_reported','proposed','tS4-term');
update public.business_facts
   set verification_status = 'superseded', superseded_at = now(), supersession_reason = 'replaced'
 where fingerprint = 'tS4-term';
update public.business_facts set superseded_at = null, supersession_reason = null where fingerprint = 'tS4-term';
rollback;

-- ── TEST M — no uniqueness per (business, fact_key): 3 facts coexist, and NO such
-- constraint exists. Expected: 3 rows; then 0 constraint rows.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label, fiscal_year,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values
  (:'biz','revenue','financial','currency',4400000,'USD','fiscal_year','FY2024',2024,'accrual','document_extraction',2,90,'extraction_confidence','proposed','tM-1'),
  (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025',2025,'accrual','document_extraction',2,90,'extraction_confidence','proposed','tM-2'),
  (:'biz','revenue','financial','currency',5600000,'USD','trailing_twelve_months','TTM',null,'accrual','document_extraction',2,90,'extraction_confidence','proposed','tM-3');
select count(*) as same_business_and_key from public.business_facts where business_id = :'biz' and fact_key = 'revenue';
rollback;

select count(*) as business_key_unique_constraints
  from pg_constraint
 where conrelid = 'public.business_facts'::regclass and contype = 'u'
   and pg_get_constraintdef(oid) ilike '%(business_id, fact_key)%';

-- ── TEST N — source deletion marks the EVIDENCE, never the fact ─────────────
-- Expected: fact intact, evidence source_status = 'deleted', document_name retained.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, source_table, source_id, confidence, confidence_basis,
   verification_status, verification_method, reviewed_by_profile_id, reviewed_at, fingerprint)
values (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,'extracted_fields','field-9',95,'extraction_confidence',
   'confirmed','document_review_accept',:'profile',now(),'tN-doc');

insert into public.business_fact_evidence
  (fact_id, business_id, evidence_type, source_table, source_id, document_name, page, form,
   value_as_stated, confidence, human_reviewed, review_event, reviewed_by_profile_id, reviewed_at, observed_at)
select id, business_id, 'extracted_field', 'extracted_fields', 'field-9', 'FY2025 P&L.pdf', 4, 'Income Statement',
       '5,200,000', 95, true, 'accepted', :'profile', now(), now()
  from public.business_facts where fingerprint = 'tN-doc';

update public.business_fact_evidence
   set source_status = 'deleted', deleted_at = now()
 where fact_id = (select id from public.business_facts where fingerprint = 'tN-doc');

select f.fact_key, f.value_numeric, f.source_status as fact_source_status,
       e.source_status as evidence_source_status, e.document_name, e.page
  from public.business_facts f join public.business_fact_evidence e on e.fact_id = f.id
 where f.fingerprint = 'tN-doc';
rollback;

-- ── TEST E3 — a document reference on a non-document observation must FAIL ──
-- Expected: ERROR — business_fact_evidence_document_ref_shape.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,95,'extraction_confidence','proposed','tE3-fact');

insert into public.business_fact_evidence
  (fact_id, business_id, evidence_type, document_id)
select id, business_id, 'owner_input', gen_random_uuid()
  from public.business_facts where fingerprint = 'tE3-fact';
rollback;

-- ── TEST T1 — a tombstone must carry its timestamp ─────────────────────────
-- Expected: ERROR — business_fact_evidence_deleted_shape.
begin;
insert into public.business_facts
  (business_id, fact_key, fact_category, value_type, value_numeric, unit, period_type, period_label,
   accounting_basis, source_type, source_authority_at_ingestion, confidence, confidence_basis,
   verification_status, fingerprint)
values (:'biz','revenue','financial','currency',5200000,'USD','fiscal_year','FY2025','accrual',
   'document_extraction',2,95,'extraction_confidence','proposed','tT1-fact');

insert into public.business_fact_evidence (fact_id, business_id, evidence_type, source_status)
select id, business_id, 'document', 'deleted'
  from public.business_facts where fingerprint = 'tT1-fact';
rollback;


-- ── TEST L — cross-business invisibility (RLS). MANUAL TEST REQUIRED ─────────
-- Needs two authenticated users and two businesses. Do NOT fake with service_role:
-- service_role bypasses RLS and would prove nothing.
--
--   begin;
--   insert into public.business_facts   (...) values (:biz_a, ...);   -- as service role
--   insert into public.business_fact_evidence (...) values (...);     -- as service role
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<auth_user_id_of_business_B_user>"}';
--   select count(*) from public.business_facts         where business_id = '<business_A_id>';  -- expect 0
--   select count(*) from public.business_fact_evidence where business_id = '<business_A_id>';  -- expect 0
--   rollback;
--
-- Definitive confirmation: sign in as that user in the app and repeat the reads.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION R — ROLLBACK (only if explicitly approved; do not run pre-emptively).
-- Drops ONLY what the installation file creates. Kept HERE (not in the
-- installation file) so the installation file is exactly one BEGIN … COMMIT.
-- ═════════════════════════════════════════════════════════════════════════════
-- begin;
--   drop view  if exists public.business_fact_conflicts;
--   drop table if exists public.business_fact_evidence;
--   drop table if exists public.business_facts;
--   drop function if exists public.business_facts_append_only();
-- commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- END PHASE 6C VERIFICATION & TEST HARNESS (REVISION 3) — NOT EXECUTED
-- ═════════════════════════════════════════════════════════════════════════════