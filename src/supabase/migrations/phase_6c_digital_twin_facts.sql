-- ═════════════════════════════════════════════════════════════════════════════
-- PHASE 6C — DIGITAL TWIN FACTS + EVIDENCE FOUNDATION
--
-- ███  NOT EXECUTED. PREPARED FOR REVIEW. DO NOT RUN WITHOUT EXPLICIT APPROVAL. ███
--
-- STATUS: NOT EXECUTED
-- REVISION 3 — owner-directed integrity/security corrections:
--   ISSUE 1  evidence can no longer claim a different business than its fact
--            (composite FK (fact_id, business_id) → business_facts(id, business_id))
--   ISSUE 2  verification identity model — human (profile) vs system (service)
--            attestation; every verification rule now holds on INSERT *and*
--            UPDATE, expressed declaratively
--   ISSUE 3  supersession lineage is same-business by composite FK
--   ISSUE 4  conflict identity includes normalized period bounds, so a third
--            observation can never suppress another pair's conflict
--   PLUS     initial-INSERT-superseded is refused; superseded rows must carry a
--            reason; INSERT/UPDATE semantics agree by construction
--
-- Revision history: rev1 (initial) → rev2 (semantic resolution pass, approved,
-- never executed) → rev3 (this file). No revision was ever executed; there is no
-- deployed earlier state to migrate.
--
-- ATOMICITY — NO PARTIAL INSTALL
--   The entire file is ONE transaction. Every precondition is checked BEFORE the
--   first object is created; any failure aborts the whole transaction, so a
--   failed prerequisite leaves the database byte-identical to before.
--
-- IDEMPOTENT / UPGRADE-SAFE / ROLLBACK-AWARE
--   create-if-not-exists + guarded DO blocks + guarded ADD CONSTRAINT; the derived
--   conflict view is dropped and recreated so its shape is always correct.
--   Verification queries are read-only. Behavioural tests run inside BEGIN…ROLLBACK.
--
-- WHAT THIS IS
--   business_facts              the canonical Digital Twin FACT layer
--   business_fact_evidence      one row per observation supporting a fact
--   business_fact_conflicts     DERIVED view (no persisted conflict state)
--   business_facts_append_only  structural guard: factual history cannot be
--                               rewritten, supersession is one-way and terminal,
--                               and a fact cannot be born superseded
--
-- WHAT THIS IS NOT (deliberate Phase 6C scope)
--   · NOT a replacement for `extracted_fields` (stays an OBSERVATION layer).
--   · NOT a replacement for BIS (still the authoritative application read layer).
--   · NOT a metric store, NOT a place for Galileo interpretation.
--   · NOT a second fact dictionary — base44/shared/canonicalFact/registry.ts is the
--     semantic authority (47 declared fact keys today; 10 of them pilot).
--   · NOT unique on (business_id, fact_key) — periods, bases and sources coexist.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — PRECONDITIONS (all hard-stops, all BEFORE any object is created).
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_argtype      text;
  v_be_kind      "char";
  v_be_id_type   text;
  v_rel          text;
  v_prosrc       text;
  v_expected     text[] := array['business_facts','business_fact_evidence','business_fact_conflicts'];
  v_recognised   boolean;
begin
  -- P1 — canonical business table present, and it really is a table.
  select c.relkind into v_be_kind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'business_entities';
  if v_be_kind is null then
    raise exception '[phase_6c] PRECONDITION FAILED — public.business_entities does not exist. '
      'business_facts is scoped to the canonical business identity; nothing was created.';
  end if;
  if v_be_kind <> 'r' then
    raise exception '[phase_6c] PRECONDITION FAILED — business_entities exists but is not a table (relkind=%).', v_be_kind;
  end if;

  -- P2 — canonical business id is uuid (every scoping FK depends on it).
  select format_type(a.atttypid, null) into v_be_id_type
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'business_entities' and a.attname = 'id' and not a.attisdropped;
  if v_be_id_type is null then
    raise exception '[phase_6c] PRECONDITION FAILED — business_entities has no id column.';
  end if;
  if v_be_id_type <> 'uuid' then
    raise exception '[phase_6c] PRECONDITION FAILED — business_entities.id is %, expected uuid. '
      'Resolve the id space before applying Phase 6C.', v_be_id_type;
  end if;

  -- P3 — required auth/profile FK target present (review + attestation identities).
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'profiles' and c.relkind = 'r'
  ) then
    raise exception '[phase_6c] PRECONDITION FAILED — public.profiles is absent; review identities would be meaningless.';
  end if;

  -- P4 — certified authorization helper present (Phase 6B). Its argument type is
  --      read here so the RLS policies bind to text or uuid correctly.
  select format_type(p.proargtypes[0], null) into v_argtype
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'can_access_business' and n.nspname = 'public' limit 1;
  if v_argtype is null then
    raise exception '[phase_6c] PRECONDITION FAILED — public.can_access_business(text|uuid) not found. '
      'Refusing to create a fact table without the certified Phase 6B authorization helper.';
  end if;

  -- P5 — uuid generation available.
  if not exists (select 1 from pg_proc where proname = 'gen_random_uuid') then
    raise exception '[phase_6c] PRECONDITION FAILED — gen_random_uuid() is unavailable.';
  end if;

  -- P6 — no unexpected foreign objects under the names this file owns.
  foreach v_rel in array v_expected loop
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = v_rel
    ) then
      if v_rel = 'business_fact_conflicts' then
        -- Derived view: this file drops and recreates it in full, so its presence
        -- is a re-run, not a conflict.
        raise notice '[phase_6c] % already present — derived view, will be dropped and recreated.', v_rel;
      else
        -- A prior Phase 6C run is recognised by its own marker column.
        select exists (
          select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = v_rel and a.attname = 'fingerprint'
        ) into v_recognised;
        if v_recognised then
          raise notice '[phase_6c] % already present with the Phase 6C marker — treating as a re-run.', v_rel;
        else
          raise exception '[phase_6c] PRECONDITION FAILED — an object named % already exists and is not recognised as Phase 6C. '
            'Refusing to overwrite or shadow it. Nothing was created.', v_rel;
        end if;
      end if;
    end if;
  end loop;

  -- P7 — the guard function, if the name is taken, must be ours.
  select prosrc into v_prosrc from pg_proc
   where proname = 'business_facts_append_only' and pronamespace = 'public'::regnamespace limit 1;
  if v_prosrc is not null and v_prosrc not like '%business_facts is append-only%' then
    raise exception '[phase_6c] PRECONDITION FAILED — a different function named business_facts_append_only exists.';
  end if;

  raise notice '[phase_6c] all preconditions passed — can_access_business(%), business_entities.id uuid', v_argtype;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- PREFLIGHT REPORT (read-only) — the two business id spaces, so the id mapping
-- is proven before any ingestion path depends on it.
-- ─────────────────────────────────────────────────────────────────────────────
select
  (select count(*) from public.business_entities)                                 as canonical_business_rows,
  (select count(*) from public.businesses)                                        as legacy_businesses_rows,
  (select count(*) from public.businesses b
     where not exists (select 1 from public.business_entities e where e.id = b.id)) as legacy_only_id_rows,
  (select count(distinct business_id) from public.dashboard_metrics
     where business_id is not null)                                               as dashboard_metrics_distinct_business_ids,
  (select count(distinct business_id) from public.extracted_fields
     where business_id is not null)                                               as extracted_fields_distinct_business_ids;


-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE 1 — public.business_facts
--
-- ONE row = ONE sourced, period-scoped, basis-aware, verifiable statement about
-- ONE business. Append-oriented: a correction is a NEW fact that supersedes the
-- old one; the old one is retained.
--
-- NO UNIQUE (business_id, fact_key). A business may hold FY2024 / FY2025 / TTM /
-- tax-basis / book-basis revenue, and two conflicting FY2025 sources.
--
-- REV3 — VERIFICATION IDENTITY MODEL (ISSUE 2)
--   "verified" needs an IDENTITY, and the identity differs by how it was verified:
--     · advisor_review, expert_review          → a HUMAN: verified_by_profile_id
--     · connected_source, authoritative_source → a SYSTEM: verified_by_service
--       (connected_accounting | connected_bank | connected_payroll |
--        authoritative_filing) — NO human profile is required, and none may be
--       invented merely to satisfy a constraint.
--     · legacy_migration                       → verified_by_service =
--       'legacy_migration' AND provenance naming the legacy record
--       (source_reference or source_id).
--   Attestation time (verified_at) is always required.
--   A fact's attestation record survives supersession (verified_* fields are
--   allowed while status is 'verified' or 'superseded') and must be cleared
--   explicitly if a fact is demoted.
--
-- REV3 — EVERY RULE THAT CAN BE DECLARATIVE IS DECLARATIVE (ISSUE 2)
--   All verification / confirmation / supersession requirements live in CHECK
--   constraints, which PostgreSQL evaluates on INSERT and UPDATE alike. The guard
--   trigger therefore carries only what constraints cannot express: factual
--   immutability, one-way/terminal supersession, and the ban on creating a fact
--   already superseded. INSERT and UPDATE cannot drift apart.
--
-- SOURCE AUTHORITY IS A SNAPSHOT, NOT AN ETERNAL RANK
--   source_authority_at_ingestion + authority_policy_version record the rank and
--   the policy in force WHEN THE FACT WAS INGESTED — they explain history. The
--   RESOLVER always ranks using the CURRENT certified policy
--   (canonicalFact/sourceHierarchy → SOURCE_AUTHORITY), falling back to this
--   snapshot only when the current policy has no mapping, and flagging that it did.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.business_facts (
  id                          uuid primary key default gen_random_uuid(),

  -- ── Identity / scope (immutable) ──
  business_id                 uuid not null
                              references public.business_entities(id) on delete cascade,
  fact_key                    text not null,      -- canonical key from canonicalFact/registry.ts
  fact_category               text not null,      -- mirrored from the registry

  -- ── Value (immutable) ──
  value_type                  text not null
                              check (value_type in ('currency','percentage','number','text','boolean','date','single_select','json')),
  value_numeric               numeric,
  value_text                  text,
  value_boolean               boolean,
  value_date                  date,
  value_json                  jsonb,
  unit                        text,
  currency                    text default 'USD',

  -- ── Definition provenance (immutable) ──
  metric_definition           text,
  metric_definition_version   text,

  -- ── Period (immutable) ──
  period_type                 text not null
                              check (period_type in ('point_in_time','month','quarter','fiscal_year','calendar_year',
                                                     'year_to_date','trailing_twelve_months','custom_period','valuation_date')),
  period_label                text,
  period_start                date,
  period_end                  date,
  as_of_date                  date,
  fiscal_year                 integer,

  -- ── Accounting basis (immutable) ──
  accounting_basis            text not null default 'unknown'
                              check (accounting_basis in ('cash','accrual','tax','book','unknown')),

  -- ── Source (immutable) ──
  source_type                 text not null
                              check (source_type in ('document_extraction','owner_reported','assessment','connected_accounting',
                                                     'connected_bank','connected_payroll','expert_verified','manual_entry',
                                                     'derived_calculation','system_migration','advisor_entry','benchmark','valuation_engine')),
  source_authority_at_ingestion smallint not null,
  authority_policy_version    text,
  source_table                text,
  source_id                   text,
  source_reference            jsonb,

  -- ── Confidence (immutable) — machine/estimation confidence, never inflated by review ──
  confidence                  numeric(5,2)
                              check (confidence is null or (confidence >= 0 and confidence <= 100)),
  confidence_basis            text,               -- 'extraction_confidence' | 'human_review' | 'calculated' | 'source_reported'

  -- ── Verification (lifecycle — mutable through controlled transitions only) ──
  verification_status         text not null default 'proposed'
                              check (verification_status in ('proposed','confirmed','verified','rejected','superseded')),
  verification_method         text
                              check (verification_method is null or verification_method in
                                     ('document_review_accept','document_review_correction','owner_confirmation',
                                      'advisor_review','expert_review','connected_source','authoritative_source',
                                      'legacy_migration')),
  reviewed_by_profile_id      uuid,               -- who made the last review decision (confirm / correct / reject)
  reviewed_at                 timestamptz,
  verified_by_profile_id      uuid,               -- HUMAN attestation identity
  verified_by_service         text,               -- SYSTEM attestation identity (REV3)
  verified_at                 timestamptz,

  -- ── Time / authorship (immutable) ──
  observed_at                 timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  created_by_profile_id       uuid,
  created_by_service          text,

  -- ── Supersession (lifecycle; lineage columns are same-business by FK) ──
  supersedes_fact_id          uuid,               -- FK (supersedes_fact_id, business_id) added below
  superseded_by_fact_id       uuid,               -- FK (superseded_by_fact_id, business_id) added below
  superseded_at               timestamptz,
  supersession_reason         text,

  -- ── Source lifecycle (lifecycle) ──
  source_status               text not null default 'present'
                              check (source_status in ('present','deleted','tombstoned')),

  -- ── Derivation (immutable) ──
  is_derived                  boolean not null default false,
  lineage                     jsonb not null default '[]'::jsonb,

  -- ── Idempotency (immutable) ──
  fingerprint                 text not null,

  metadata                    jsonb not null default '{}'::jsonb,   -- lifecycle/audit only

  -- ── Uniqueness ──
  constraint business_facts_fingerprint_unique unique (fingerprint),
  -- REV3 (ISSUES 1 & 3): exists ONLY so the three composite foreign keys can
  -- prove same-business references. It expresses no business rule of its own —
  -- id is already unique — it is the referenced key those FKs require.
  constraint business_facts_id_business_unique unique (id, business_id),

  -- ── Structural sanity ──
  constraint business_facts_no_self_supersede   check (superseded_by_fact_id is null or superseded_by_fact_id <> id),
  constraint business_facts_no_self_supersedes  check (supersedes_fact_id is null or supersedes_fact_id <> id),
  constraint business_facts_value_shape check (
    (value_type in ('currency','percentage','number') and value_numeric is not null)
    or (value_type = 'boolean'       and value_boolean is not null)
    or (value_type = 'date'          and value_date    is not null)
    or (value_type in ('text','single_select') and value_text is not null)
    or (value_type = 'json'          and value_json    is not null)
  ),

  -- ── VERIFIED: method, attestation identity, provenance (REV3, ISSUE 2) ──
  -- 1. Only the four attestation methods (plus legacy migration) may produce 'verified'.
  --    This is what refuses 'verified' + 'document_review_accept' at INSERT and UPDATE.
  constraint business_facts_verified_method_required check (
    verification_status <> 'verified'
    or (verification_method is not null and verification_method in
        ('advisor_review','expert_review','connected_source','authoritative_source','legacy_migration'))
  ),
  -- 2. Verification always carries a time and at least one identity.
  constraint business_facts_verified_requires_attestation check (
    verification_status <> 'verified'
    or (verified_at is not null and (verified_by_profile_id is not null or verified_by_service is not null))
  ),
  -- 3. Human methods require the human.
  constraint business_facts_verified_human_needs_profile check (
    verification_status <> 'verified'
    or verification_method not in ('advisor_review','expert_review')
    or verified_by_profile_id is not null
  ),
  -- 4. System methods require the system identity — a human is NOT required.
  constraint business_facts_verified_source_needs_service check (
    verification_status <> 'verified'
    or verification_method not in ('connected_source','authoritative_source','legacy_migration')
    or verified_by_service is not null
  ),
  -- 5. The system identity vocabulary is closed.
  constraint business_facts_verified_by_service_vocab check (
    verified_by_service is null or verified_by_service in
      ('connected_accounting','connected_bank','connected_payroll','authoritative_filing','legacy_migration')
  ),
  -- 6. The system identity must match the method that produced it.
  constraint business_facts_verified_service_method_alignment check (
    verification_status <> 'verified' or verified_by_service is null
    or (verification_method = 'connected_source'      and verified_by_service in ('connected_accounting','connected_bank','connected_payroll'))
    or (verification_method = 'authoritative_source'  and verified_by_service = 'authoritative_filing')
    or (verification_method = 'legacy_migration'      and verified_by_service = 'legacy_migration')
  ),
  -- 7. Source-based verification must name the source, not just the category.
  constraint business_facts_verified_provenance_required check (
    verification_status <> 'verified'
    or verification_method not in ('connected_source','authoritative_source')
    or (source_table is not null or source_id is not null or source_reference is not null)
  ),
  -- 8. A migrated fact must name the legacy record it came from.
  constraint business_facts_legacy_migration_needs_provenance check (
    verification_status <> 'verified'
    or verification_method <> 'legacy_migration'
    or (source_reference is not null or source_id is not null)
  ),
  -- 9. Attestation fields may only exist while the fact is verified or was verified
  --    before being superseded; demoting a fact requires clearing them explicitly.
  constraint business_facts_verified_fields_scope check (
    verification_status in ('verified','superseded')
    or (verified_by_profile_id is null and verified_by_service is null and verified_at is null)
  ),

  -- ── CONFIRMED / REJECTED: a human owns the decision (REV3, ISSUE 2) ──
  constraint business_facts_confirmed_needs_review check (
    verification_status <> 'confirmed'
    or (verification_method is not null and reviewed_by_profile_id is not null)
  ),
  -- The methods that produce 'confirmed' are exactly the review/statement methods.
  -- 'advisor_review' / 'expert_review' can never produce 'confirmed'.
  constraint business_facts_confirmed_method_alignment check (
    verification_status <> 'confirmed'
    or verification_method in ('document_review_accept','document_review_correction','owner_confirmation','legacy_migration')
  ),
  constraint business_facts_rejected_needs_reviewer check (
    verification_status <> 'rejected' or reviewed_by_profile_id is not null
  ),
  constraint business_facts_review_timestamp check (
    verification_status not in ('confirmed','rejected') or reviewed_at is not null
  ),

  -- ── SUPERSESSION: explicit, reasoned, consistent (REV3) ──
  constraint business_facts_superseded_needs_reason check (
    superseded_at is null
    or (supersession_reason is not null and length(btrim(supersession_reason)) > 0)
  ),
  constraint business_facts_superseded_consistent check (
    (superseded_at is null and superseded_by_fact_id is null and verification_status <> 'superseded')
    or (superseded_at is not null and verification_status = 'superseded')
  )
);

comment on table public.business_facts is
  'Phase 6C — canonical Digital Twin FACT layer. One sourced, period-scoped, basis-aware, verifiable statement about one business. APPEND-ONLY: corrections supersede, they never rewrite. Facts feed BIS; BIS remains the authoritative application read layer. Not a metric store, not a place for Galileo interpretation, not a replacement for extracted_fields.';
comment on column public.business_facts.fingerprint is
  'Deterministic idempotency key: sha256(business_id|fact_key|period_type|period_label|period_start|period_end|accounting_basis|source_type|source_table|source_id|canonical_value). Includes the value, so a corrected value is a NEW fact that supersedes the old one instead of overwriting it. Identity is the OBSERVATION, not the review state — so re-reviewing a field is a lifecycle transition on the same fact.';
comment on column public.business_facts.source_authority_at_ingestion is
  'SNAPSHOT of the source authority rank when the fact was ingested (with authority_policy_version). The resolver ranks using the CURRENT certified policy (canonicalFact/sourceHierarchy); this column explains the history and is used only as a flagged fallback when the current policy has no mapping for that source_type.';
comment on column public.business_facts.verification_status is
  'proposed = machine/system observation, no human review yet. confirmed = an authorized human owns the value (accepted as-is, corrected, or stated). verified = independently attested (human advisor/expert) OR read from a system of record (connected/authoritative source). rejected = reviewed and refused. superseded = replaced (terminal). VERIFIED IS NOT "SOMEONE LOOKED AT IT".';
comment on column public.business_facts.verified_by_profile_id is
  'HUMAN attestation identity. Required for advisor_review and expert_review; not required for system-attested verification.';
comment on column public.business_facts.verified_by_service is
  'SYSTEM attestation identity: connected_accounting | connected_bank | connected_payroll | authoritative_filing | legacy_migration. Required for connected_source, authoritative_source and legacy_migration. No synthetic human profile may be used to represent a service.';
comment on column public.business_facts.confidence is
  'Machine/estimation confidence in the value as read or estimated. NEVER changed by human review — human review is recorded in verification_status / verification_method / reviewed_by, and the derived read-time tier accounts for it.';
comment on column public.business_facts.supersedes_fact_id is
  'The fact this one replaces. Same-business is enforced by the composite foreign key (supersedes_fact_id, business_id) → business_facts(id, business_id).';
comment on column public.business_facts.superseded_by_fact_id is
  'The fact that replaced this one. Same-business is enforced by the composite foreign key (superseded_by_fact_id, business_id) → business_facts(id, business_id).';


-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE 2 — public.business_fact_evidence
-- One row per observation behind a fact: what lets Galileo answer
-- "where did you get that number?" without reverse-engineering the database.
-- A source being deleted marks the EVIDENCE row, never the fact.
--
-- REV3 (ISSUE 1) — business_id is NOT an independent claim.
--   The composite foreign key (fact_id, business_id) → business_facts(id, business_id)
--   makes it structurally impossible for an evidence row to belong to Business B
--   while supporting a Business A fact, even under a privileged/service-role write.
--   business_id is also tied to business_entities directly, so it is canonical.
--   RLS on this table therefore evaluates the same business the fact is scoped to.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.business_fact_evidence (
  id                    uuid primary key default gen_random_uuid(),
  fact_id               uuid not null,      -- composite FK to business_facts(id, business_id), added below
  business_id           uuid not null,      -- composite FK + business_entities FK, added below
  evidence_type         text not null
                        check (evidence_type in ('document','extracted_field','document_analysis','assessment_answer',
                                                 'assessment_calculation','valuation_answer','valuation_financial',
                                                 'valuation_evidence','expert_verification','owner_input',
                                                 'connected_record','calculation','manual_record','benchmark',
                                                 'guest_session','legacy_record')),
  source_table          text,
  source_id             text,
  document_id           uuid,
  document_analysis_id  uuid,
  extracted_field_id    uuid,
  document_name         text,
  document_type         text,
  page                  integer,
  line                  text,
  form                  text,
  locator               jsonb not null default '{}'::jsonb,
  value_as_stated       text,
  confidence            numeric(5,2) check (confidence is null or (confidence >= 0 and confidence <= 100)),
  human_reviewed        boolean not null default false,
  review_event          text,        -- 'accepted' | 'corrected' | 'rejected' | 'advisor_verified' | 'expert_verified'
  reviewed_by_profile_id uuid,
  reviewed_at           timestamptz,
  observed_at           timestamptz,
  source_status         text not null default 'present'
                        check (source_status in ('present','deleted','tombstoned')),
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),

  -- A document reference only makes sense on a document-shaped observation.
  constraint business_fact_evidence_document_ref_shape check (
    document_id is null or evidence_type in ('document','extracted_field','document_analysis')
  ),
  -- A tombstone must say when it was tombstoned.
  constraint business_fact_evidence_deleted_shape check (
    source_status <> 'deleted' or deleted_at is not null
  )
);

comment on table public.business_fact_evidence is
  'Phase 6C — the observation(s) supporting a business fact. Evidence is never deleted when a source disappears: the row is marked source_status=deleted (with deleted_at) so the fact keeps its provenance.';
comment on column public.business_fact_evidence.business_id is
  'The business of the FACT this evidence supports — enforced by the composite FK (fact_id, business_id) → business_facts(id, business_id). It is not an independent claim, so evidence can never widen or shift the tenant scope of a fact.';


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 0B — SAME-BUSINESS FOREIGN KEYS (ISSUES 1 & 3)
--
-- Why these are added after the tables rather than inline: a foreign key that
-- references a UNIQUE constraint must be created once that constraint exists.
-- Installing them in one guarded block removes any ordering dependency and keeps
-- the file safely re-runnable.
--
--   · evidence (fact_id, business_id) → business_facts (id, business_id)
--       CASCADE — evidence cannot outlive its fact, and cannot disagree with it.
--   · evidence (business_id) → business_entities (id)
--       CASCADE — business_id is canonical on its own.
--   · facts (supersedes_fact_id, business_id) → business_facts (id, business_id)
--       NO ACTION — a fact may only replace a fact of the SAME business.
--   · facts (superseded_by_fact_id, business_id) → business_facts (id, business_id)
--       NO ACTION — a fact may only be replaced by a fact of the SAME business.
--       (NO ACTION rather than RESTRICT so a whole business cascading away with
--        all of its facts in one statement is not blocked by its own lineage.)
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_ns oid := 'public'::regnamespace;
begin
  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
     where t.relnamespace = v_ns and t.relname = 'business_fact_evidence'
       and c.conname = 'business_fact_evidence_fact_business_fk'
  ) then
    alter table public.business_fact_evidence
      add constraint business_fact_evidence_fact_business_fk
      foreign key (fact_id, business_id)
      references public.business_facts (id, business_id) on delete cascade;
    raise notice '[phase_6c] installed business_fact_evidence_fact_business_fk';
  end if;

  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
     where t.relnamespace = v_ns and t.relname = 'business_fact_evidence'
       and c.conname = 'business_fact_evidence_business_fk'
  ) then
    alter table public.business_fact_evidence
      add constraint business_fact_evidence_business_fk
      foreign key (business_id) references public.business_entities (id) on delete cascade;
    raise notice '[phase_6c] installed business_fact_evidence_business_fk';
  end if;

  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
     where t.relnamespace = v_ns and t.relname = 'business_facts'
       and c.conname = 'business_facts_supersedes_same_business_fk'
  ) then
    alter table public.business_facts
      add constraint business_facts_supersedes_same_business_fk
      foreign key (supersedes_fact_id, business_id)
      references public.business_facts (id, business_id) on delete no action;
    raise notice '[phase_6c] installed business_facts_supersedes_same_business_fk';
  end if;

  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
     where t.relnamespace = v_ns and t.relname = 'business_facts'
       and c.conname = 'business_facts_superseded_by_same_business_fk'
  ) then
    alter table public.business_facts
      add constraint business_facts_superseded_by_same_business_fk
      foreign key (superseded_by_fact_id, business_id)
      references public.business_facts (id, business_id) on delete no action;
    raise notice '[phase_6c] installed business_facts_superseded_by_same_business_fk';
  end if;

  raise notice '[phase_6c] same-business foreign keys present';
end $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- GUARD TRIGGER — only what constraints cannot express.
--
-- IMMUTABLE (any change = error; append a new fact instead):
--   business_id, fact_key, fact_category, value_*, unit, currency,
--   metric_definition(_version), period_*, accounting_basis, source_type,
--   source_authority_at_ingestion, authority_policy_version, source_table,
--   source_id, source_reference, confidence, confidence_basis, observed_at,
--   created_at, created_by_*, supersedes_fact_id, is_derived, lineage, fingerprint
--
-- MUTABLE THROUGH CONTROLLED TRANSITIONS (all by the service role), with the
-- permitted combinations enforced by the CHECK constraints above:
--   verification_status, verification_method, reviewed_by/at, verified_by_profile_id,
--   verified_by_service, verified_at, superseded_at, superseded_by_fact_id,
--   supersession_reason, source_status, metadata
--
-- What lives HERE (and nowhere else):
--   1. factual content is immutable;
--   2. a fact cannot be CREATED already superseded (constraints cannot tell INSERT
--      from UPDATE, so this needs the trigger);
--   3. supersession is one-way and terminal.
-- Every other rule is declarative, so INSERT and UPDATE cannot diverge.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.business_facts_append_only()
returns trigger
language plpgsql
as $$
begin
  -- 1. A fact is never born superseded. Supersession is reached by replacing an
  --    earlier fact, never asserted on a new row (which would let a caller create
  --    facts outside the lifecycle). Historical promotion imports facts with their
  --    real status and links lineage when the successor is ingested.
  if tg_op = 'INSERT' then
    if new.verification_status = 'superseded' then
      raise exception 'a fact cannot be created already superseded (fingerprint %) — supersede it by ingesting its successor',
        new.fingerprint using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  -- 2. Factual content is immutable (business_facts is append-only).
  if (new.business_id, new.fact_key, new.fact_category, new.value_type,
      new.value_numeric, new.value_text, new.value_boolean, new.value_date, new.value_json,
      new.unit, new.currency, new.metric_definition, new.metric_definition_version,
      new.period_type, new.period_label, new.period_start, new.period_end, new.as_of_date, new.fiscal_year,
      new.accounting_basis, new.source_type, new.source_authority_at_ingestion, new.authority_policy_version,
      new.source_table, new.source_id, new.source_reference, new.confidence, new.confidence_basis,
      new.observed_at, new.created_at, new.created_by_profile_id, new.created_by_service,
      new.supersedes_fact_id, new.is_derived, new.lineage, new.fingerprint)
     is distinct from
     (old.business_id, old.fact_key, old.fact_category, old.value_type,
      old.value_numeric, old.value_text, old.value_boolean, old.value_date, old.value_json,
      old.unit, old.currency, old.metric_definition, old.metric_definition_version,
      old.period_type, old.period_label, old.period_start, old.period_end, old.as_of_date, old.fiscal_year,
      old.accounting_basis, old.source_type, old.source_authority_at_ingestion, old.authority_policy_version,
      old.source_table, old.source_id, old.source_reference, old.confidence, old.confidence_basis,
      old.observed_at, old.created_at, old.created_by_profile_id, old.created_by_service,
      old.supersedes_fact_id, old.is_derived, old.lineage, old.fingerprint)
  then
    raise exception 'business_facts is append-only: factual content of fact % cannot be modified. '
      'Ingest a superseding fact instead (supersedes_fact_id).', old.id
      using errcode = 'restrict_violation';
  end if;

  -- 3. Supersession is one-way and terminal.
  if old.superseded_at is not null and new.superseded_at is null then
    raise exception 'fact % is superseded; supersession cannot be undone', old.id using errcode = 'restrict_violation';
  end if;
  if old.verification_status = 'superseded' and new.verification_status <> 'superseded' then
    raise exception 'fact % is superseded; its state is frozen', old.id using errcode = 'restrict_violation';
  end if;

  return new;
end $$;

drop trigger if exists business_facts_append_only on public.business_facts;
create trigger business_facts_append_only
  before insert or update on public.business_facts
  for each row execute function public.business_facts_append_only();


-- ═════════════════════════════════════════════════════════════════════════════
-- DERIVED CONFLICT VIEW (REV3 — ISSUE 4)
--
-- A conflict can only exist INSIDE one exact semantic identity. The identity is:
--   business_id
--   fact_key
--   period_type
--   normalized period_label
--   accounting_basis
--   normalized period_start / period_end / as_of_date
--
-- REV2 grouped by label and THEN demanded date equality in HAVING, which let a
-- third observation suppress another pair's conflict: with A/B sharing bounds and
-- C carrying the same label but different bounds, the HAVING min/max comparison
-- failed for the whole group and A/B's real conflict disappeared. Normalizing the
-- bounds INTO the grouping key removes that class of suppression entirely: each
-- (label + exact bounds) identity is evaluated on its own.
--
-- Therefore these can NEVER be reported as conflicts, because they differ in a
-- grouping column:
--   FY2024 revenue vs FY2025 revenue        → different period_label
--   FY2025 revenue vs TTM revenue           → different period_type
--   EBITDA vs net income                    → different fact_key
--   reported EBITDA vs normalized EBITDA    → different fact_key
--   cash-basis vs accrual-basis revenue     → different accounting_basis
--   Business A vs Business B                → different business_id
--   same label, genuinely different bounds  → different normalized bounds
--
-- MATERIALITY: the registry's per-fact threshold (conflict_materiality_threshold —
-- 0.05 financial, 0.1 quality/profile) is applied by the RESOLVER to label a
-- difference minor vs material. It is deliberately absent here: below threshold
-- never means discard, overwrite, merge or average. Every observation is returned
-- by this view, stored in the table, and resolved as an alternative.
-- ═════════════════════════════════════════════════════════════════════════════
drop view if exists public.business_fact_conflicts;
create view public.business_fact_conflicts as
select
  a.business_id,
  a.fact_key,
  a.period_type,
  coalesce(a.period_label, '')                      as period_label,
  a.accounting_basis,
  coalesce(a.period_start, date '0001-01-01')       as period_start_key,
  coalesce(a.period_end,   date '0001-01-01')       as period_end_key,
  coalesce(a.as_of_date,   date '0001-01-01')       as as_of_date_key,
  count(*)                                          as candidate_count,
  min(a.value_numeric)                              as min_value,
  max(a.value_numeric)                              as max_value,
  max(a.value_numeric) - min(a.value_numeric)       as absolute_spread,
  case when max(a.value_numeric) <> 0
       then round(((max(a.value_numeric) - min(a.value_numeric)) / abs(max(a.value_numeric))) * 100, 2)
  end                                               as spread_percentage,
  array_agg(a.id order by a.source_authority_at_ingestion, a.confidence desc nulls last) as candidate_fact_ids,
  array_agg(distinct a.source_type)                 as candidate_source_types,
  array_agg(distinct a.verification_status)         as candidate_verification_states
from public.business_facts a
where a.superseded_at is null
  and a.verification_status <> 'rejected'
  and a.value_type in ('currency','percentage','number')
  and a.value_numeric is not null
group by
  a.business_id,
  a.fact_key,
  a.period_type,
  coalesce(a.period_label, ''),
  a.accounting_basis,
  coalesce(a.period_start, date '0001-01-01'),
  coalesce(a.period_end,   date '0001-01-01'),
  coalesce(a.as_of_date,   date '0001-01-01')
having count(*) > 1
   and min(a.value_numeric) <> max(a.value_numeric);

comment on view public.business_fact_conflicts is
  'Phase 6C — derived conflict candidates: coexisting live facts sharing the SAME business, fact key, period type, period label, accounting basis AND identical normalized period bounds (period_start/period_end/as_of_date), whose numeric values differ. Nothing is persisted, so conflict state cannot drift. Observations that differ in any grouping column are separate identities and neither conflicts with nor suppresses the other. The registry materiality threshold is applied by the resolver to classify minor vs material; this view never suppresses a candidate.';


-- ═════════════════════════════════════════════════════════════════════════════
-- INDEXES — from the resolver's actual access pattern, nothing speculative.
-- (business_facts_id_business_unique is created by the unique constraint above and
--  is deliberately NOT repeated here.)
-- ═════════════════════════════════════════════════════════════════════════════
create index if not exists idx_business_facts_resolver
  on public.business_facts (business_id, fact_key, period_type, period_label, accounting_basis)
  where superseded_at is null;

create index if not exists idx_business_facts_verification
  on public.business_facts (business_id, verification_status)
  where superseded_at is null;

create index if not exists idx_business_facts_provenance
  on public.business_facts (source_table, source_id);

create index if not exists idx_business_facts_supersedes
  on public.business_facts (supersedes_fact_id);

create index if not exists idx_fact_evidence_fact      on public.business_fact_evidence (fact_id);
create index if not exists idx_fact_evidence_source    on public.business_fact_evidence (source_table, source_id);
create index if not exists idx_fact_evidence_document  on public.business_fact_evidence (business_id, document_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- RLS / SECURITY — the Phase 6B pattern, UNCHANGED by revision 3.
--   · RLS ENABLED on both tables.
--   · READ: exactly one `authenticated` policy per table via the certified
--     can_access_business(business_id) helper. No profile-wide fallback.
--   · WRITE: NO policies at all — no client can insert, update or delete a fact.
--     Only the service-role ingestion path writes, after authenticating the actor
--     and authorizing the business.
-- Revision 3 adds no policy and relaxes none: it makes the evidence row's
-- business_id follow its fact's business structurally, so the existing read
-- policy on evidence evaluates the same tenant the fact is scoped to.
-- NOTE: audit identities (reviewed_by / verified_by / created_by) intentionally
-- carry NO foreign key to profiles: an audit identity is a historical value and
-- must survive profile deletion, exactly like source_id. Precondition P3 proves
-- profiles exists so those ids are meaningful.
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.business_facts         enable row level security;
alter table public.business_fact_evidence enable row level security;

do $$
declare
  v_argtype text;
begin
  select format_type(p.proargtypes[0], null) into v_argtype
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'can_access_business' and n.nspname = 'public' limit 1;

  if v_argtype is null then
    raise exception '[phase_6c] STOP — can_access_business missing; refusing to leave business_facts without its read policy';
  end if;

  execute 'drop policy if exists business_facts_read on public.business_facts';
  execute format($f$
    create policy business_facts_read on public.business_facts
      for select to authenticated using (public.can_access_business(business_id::%s))
  $f$, v_argtype);

  execute 'drop policy if exists business_fact_evidence_read on public.business_fact_evidence';
  execute format($f$
    create policy business_fact_evidence_read on public.business_fact_evidence
      for select to authenticated using (public.can_access_business(business_id::%s))
  $f$, v_argtype);

  raise notice '[phase_6c] read policies installed via can_access_business(%)', v_argtype;
end $$;

-- EXPLICIT NON-ACTION, stated so it is never "fixed" by mistake:
--   No INSERT / UPDATE / DELETE policy is created. RLS + zero write policies
--   rejects all client writes. Do NOT add `profile_id = auth.uid()` write policies.

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- END PHASE 6C INSTALLATION (REVISION 3) — NOT EXECUTED
--
-- This file is the atomic installation ONLY: one BEGIN … COMMIT. It contains no
-- verification queries and no behavioural test inserts/updates.
--
-- The companion harness lives in:
--   src/supabase/migrations/phase_6c_digital_twin_facts_verification.sql
--     · SECTION V — V1–V9 read-only verification
--     · SECTION T — the full transactional behavioural suite (E1…T1), every block
--       in BEGIN … ROLLBACK
--     · SECTION L — the manual cross-business RLS test
--     · SECTION R — the (commented-out) rollback reference
-- ═════════════════════════════════════════════════════════════════════════════