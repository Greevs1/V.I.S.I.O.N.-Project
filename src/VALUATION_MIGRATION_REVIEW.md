# Business Valuation — Final Migration Review Package

**Status:** PENDING APPROVAL — DO NOT EXECUTE
**Phase:** 13 (Business Valuation Foundation)
**Scope:** Additive only. No existing tables modified.

---

## Section 0 — Confirmed Frontend Files (Verified, Not Assumed)

| Concern | Exact File | Evidence |
| :--- | :--- | :--- |
| Advisory Hub dropdown | `src/components/layout/Sidebar.jsx` | `advisoryItems` array (lines 28–48); `Compass` → "Advisory Hub" with children Command Center / Exit Readiness / M&A Simulator / Resource Library |
| Expert Advisors route | `src/App.jsx` | `<Route path="/expert-advisors" element={<ExpertAdvisorsView />} />` (admin block) |
| Supabase Status route | `src/App.jsx` | `<Route path="/dev/supabase-status" element={<SupabaseStatus />} />` |
| Active business resolution | `src/lib/AuthContext.jsx` | `resolveBusinessContext()` reads `business_owners` table → `activeContext.businessId`; also `src/lib/BusinessContext.jsx` exposes `bizCtx.active_business_id` |
| Protected route component | `src/components/ProtectedRoute.jsx` | Uses `useAuth()`, renders `<Outlet />` |
| Role resolution utility | `src/lib/AuthContext.jsx` | `const role = supabaseProfile?.role || user?.role` (values: owner \| advisor \| team_member \| super_admin) |
| Backend service wrapper | `src/api/base44Client.js` | `export const base44` from `@base44/sdk`; invoke via `base44.functions.invoke('fnName', payload)` |
| Profile identity | `src/lib/AuthContext.jsx` | `supabaseProfile.id` is the authoritative `profiles.id`; `supabaseProfile.role` drives authorization |

**No UI file will be modified based on assumption.** All edits will target the files above.

---

## Section 1 — Advisor Relationship Definition

### Confirmed IDs

| ID | Source | Meaning |
| :--- | :--- | :--- |
| `profiles.id` | Supabase `profiles` table | Authoritative identity record for every authenticated user (owner, advisor, team_member, super_admin) |
| `expert_profiles.id` | `expert_profiles` entity | Display/metadata extension (bio, specialties, calendar URL); **not** an auth identity |
| `expert_profiles.application_id` | `expert_applications` entity | Links an expert profile to its application record |
| Base44 `user.id` | `base44.auth.me()` | Platform auth identity; synced to `profiles.base44_user_id` via `syncBase44UserToSupabaseProfile` |

### Decision

`valuation_assignments.advisor_profile_id` **references `profiles.id` exclusively.**

- Every advisor (role = `advisor` or `super_admin`) has a corresponding `profiles` row (enforced by existing `syncBase44UserToSupabaseProfile` flow).
- `expert_profiles` is a **display/metadata lookup**, never an authorization source.
- No ambiguous field. No row will ever contain `expert_profiles.id` in `advisor_profile_id`.
- If an Expert Advisor exists *only* in `expert_profiles` without a `profiles` row, they **cannot** be assigned to a valuation until a `profiles` row is created. The `assignValuationAdvisor` function will reject with `ADVISOR_PROFILE_NOT_FOUND`.

### Unresolved Assumption (flagged)

I have not yet read the live Supabase `profiles` schema DDL to confirm `profiles.id` is a `uuid` primary key with `base44_user_id` as a unique text column. The existing `syncBase44UserToSupabaseProfile` and `supabaseProfileData` functions strongly imply this, but the exact column type of `profiles.id` will be verified against `checkProfilesSchema` output before execution. The migration assumes `profiles.id :: uuid`.

---

## Section 2 — State Systems (Separated)

### Valuation Lifecycle Status (`business_valuations.status`)

`draft` → `data_collection` → `advisor_review` → `ready_to_publish` → `published` → `archived`

### Client-Sharing Status (`business_valuations.client_sharing_status`)

`not_shared` | `shared` | `revoked`

These two systems never mix. The client summary function checks `client_sharing_status = 'shared'`, **not** `status = 'shared'`.

---

## Section 3 — Full Additive SQL Migration

```sql
-- ============================================================================
-- BUSINESS VALUATION — ADDITIVE MIGRATION (Phase 13)
-- PENDING APPROVAL — DO NOT EXECUTE YET
-- All new tables. No existing table is altered.
-- ============================================================================

BEGIN;

-- ── 1. CORE ROOT TABLES ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS business_valuations (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                 uuid NOT NULL REFERENCES business_entities(id) ON DELETE RESTRICT,
  lead_advisor_profile_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status                      text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','data_collection','advisor_review','ready_to_publish','published','archived')),
  client_sharing_status       text NOT NULL DEFAULT 'not_shared'
                              CHECK (client_sharing_status IN ('not_shared','shared','revoked')),
  shared_version_id           uuid,          -- FK added later (circular)
  last_shared_version_id      uuid,          -- FK added later (circular)
  latest_published_version_id uuid,          -- FK added later (circular)
  shared_at                   timestamptz,
  sharing_revoked_at          timestamptz,
  valuation_date              date,
  archived_at                 timestamptz,
  archived_by                 uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by                  uuid REFERENCES profiles(id) ON DELETE SET NULL
);
COMMENT ON COLUMN business_valuations.lead_advisor_profile_id IS
  'Display/ownership only. Does NOT grant access. Authorization comes solely from valuation_assignments.';

-- ── 2. VERSION TABLE (created early for circular FK) ────────────────────────

CREATE TABLE IF NOT EXISTS valuation_versions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id             uuid NOT NULL REFERENCES business_valuations(id) ON DELETE RESTRICT,
  version_number           integer NOT NULL,
  status                   text NOT NULL DEFAULT 'published'
                           CHECK (status IN ('published')),
  internal_snapshot_data   jsonb NOT NULL DEFAULT '{}',
  client_snapshot_data     jsonb NOT NULL DEFAULT '{}',
  published_at             timestamptz NOT NULL DEFAULT now(),
  published_by             uuid REFERENCES profiles(id) ON DELETE SET NULL,
  publication_notes        text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_version_number UNIQUE (valuation_id, version_number)
);

-- ── 3. CIRCULAR FOREIGN KEYS (now safe) ─────────────────────────────────────

ALTER TABLE business_valuations
  ADD CONSTRAINT fk_val_shared_version
    FOREIGN KEY (shared_version_id) REFERENCES valuation_versions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_val_last_shared_version
    FOREIGN KEY (last_shared_version_id) REFERENCES valuation_versions(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_val_latest_published_version
    FOREIGN KEY (latest_published_version_id) REFERENCES valuation_versions(id) ON DELETE RESTRICT;

-- ── 4. CHILD WORKING TABLES ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS valuation_sections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id          uuid NOT NULL REFERENCES business_valuations(id) ON DELETE RESTRICT,
  section_key           text NOT NULL,
  title                 text,
  completion_pct        numeric(5,2) NOT NULL DEFAULT 0
                        CHECK (completion_pct >= 0 AND completion_pct <= 100),
  section_status        text NOT NULL DEFAULT 'not_started'
                        CHECK (section_status IN ('not_started','in_progress','complete','blocked')),
  advisor_review_status text NOT NULL DEFAULT 'pending'
                        CHECK (advisor_review_status IN ('pending','in_review','approved','changes_requested')),
  reviewed_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_section_key UNIQUE (valuation_id, section_key)
);

CREATE TABLE IF NOT EXISTS valuation_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key      text NOT NULL,
  section_key       text,
  prompt            text NOT NULL,
  answer_type       text NOT NULL
                    CHECK (answer_type IN (
                      'short_text','long_text','integer','decimal','currency',
                      'percentage','boolean','date','single_select','multi_select',
                      'structured','document_reference'
                    )),
  options           jsonb,        -- allowed values for single_select / multi_select
  conditional_logic jsonb,        -- display/required conditions
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_question_key UNIQUE (question_key)
);
COMMENT ON COLUMN valuation_questions.is_active IS
  'Deactivate (false) instead of deleting. Answers referencing inactive questions are preserved.';

CREATE TABLE IF NOT EXISTS valuation_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id    uuid NOT NULL REFERENCES business_valuations(id) ON DELETE RESTRICT,
  question_id     uuid NOT NULL REFERENCES valuation_questions(id) ON DELETE RESTRICT,
  section_key     text,
  answer_value    jsonb,
  answer_source   text NOT NULL DEFAULT 'manual'
                  CHECK (answer_source IN ('manual','document_extracted','advisor_entered','system_derived')),
  verified        boolean NOT NULL DEFAULT false,
  verified_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at     timestamptz,
  document_ref_id uuid,          -- references documents(id) — validated in backend to belong to same business
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT uq_answer UNIQUE (valuation_id, question_id)
);

CREATE TABLE IF NOT EXISTS valuation_financials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id  uuid NOT NULL REFERENCES business_valuations(id) ON DELETE RESTRICT,
  period_type   text NOT NULL
                CHECK (period_type IN ('fiscal_year','calendar_year','trailing_twelve_months','year_to_date','custom')),
  period_start date NOT NULL,
  period_end    date NOT NULL,
  fiscal_year   integer,
  revenue                numeric(19,4),
  cogs                   numeric(19,4),
  gross_profit           numeric(19,4),
  opex                   numeric(19,4),
  ebitda                 numeric(19,4),
  net_profit             numeric(19,4),
  add_backs_total        numeric(19,4),
  recast_ebitda          numeric(19,4),
  is_approved            boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT uq_financial_period UNIQUE (valuation_id, period_start, period_end, period_type),
  CONSTRAINT chk_period_order CHECK (period_end >= period_start)
);
COMMENT ON COLUMN valuation_financials.is_approved IS
  'Only approved financials are loaded into a published snapshot.';

CREATE TABLE IF NOT EXISTS valuation_adjustments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id         uuid NOT NULL REFERENCES business_valuations(id) ON DELETE RESTRICT,
  financial_id         uuid REFERENCES valuation_financials(id) ON DELETE SET NULL,
  adjustment_category  text NOT NULL,
  description          text,
  amount               numeric(19,4) NOT NULL DEFAULT 0,
  adjustment_direction text NOT NULL
                       CHECK (adjustment_direction IN ('add_back','deduction','neutral')),
  is_approved          boolean NOT NULL DEFAULT false,
  evidence_doc_id      uuid,          -- documents(id); validated to same business
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS valuation_multiple_factors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id        uuid NOT NULL REFERENCES business_valuations(id) ON DELETE RESTRICT,
  factor_key          text NOT NULL,
  factor_label         text,
  multiple_adjustment numeric(10,4) NOT NULL DEFAULT 0,
  rationale           text,
  is_approved         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS valuation_scenarios (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id        uuid NOT NULL REFERENCES business_valuations(id) ON DELETE RESTRICT,
  scenario_type       text NOT NULL
                      CHECK (scenario_type IN ('conservative','defensible','aggressive','indicated')),
  enterprise_value_low  numeric(19,4),
  enterprise_value_high numeric(19,4),
  equity_value_low       numeric(19,4),
  equity_value_high      numeric(19,4),
  methodology        text,
  is_approved        boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS valuation_evidence (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id      uuid NOT NULL REFERENCES business_valuations(id) ON DELETE RESTRICT,
  source_table      text NOT NULL,
  source_record_id  uuid NOT NULL,
  evidence_label    text,
  confidence_score  numeric(5,2)
                    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL
);
COMMENT ON COLUMN valuation_evidence.source_record_id IS
  'Metadata preserved even if source document is later removed. No hard FK to documents.';

CREATE TABLE IF NOT EXISTS valuation_assignments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id         uuid NOT NULL REFERENCES business_valuations(id) ON DELETE RESTRICT,
  advisor_profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assignment_role      text NOT NULL DEFAULT 'contributor'
                       CHECK (assignment_role IN ('lead','reviewer','contributor','co_advisor')),
  can_view             boolean NOT NULL DEFAULT true,
  can_edit             boolean NOT NULL DEFAULT false,
  can_review           boolean NOT NULL DEFAULT false,
  can_publish          boolean NOT NULL DEFAULT false,
  assigned_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at          timestamptz NOT NULL DEFAULT now(),
  removed_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_active_perms CHECK (
    (removed_at IS NULL) OR
    (can_view = false AND can_edit = false AND can_review = false AND can_publish = false)
  )
);
-- Partial unique index: one active assignment per advisor per valuation
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_assignment
  ON valuation_assignments (valuation_id, advisor_profile_id)
  WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS valuation_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id    uuid NOT NULL REFERENCES business_valuations(id) ON DELETE RESTRICT,
  actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action_type     text NOT NULL,
  old_value       jsonb,
  new_value       jsonb,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 5. INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_val_business_id        ON business_valuations(business_id);
CREATE INDEX IF NOT EXISTS idx_val_status             ON business_valuations(status);
CREATE INDEX IF NOT EXISTS idx_val_sharing_status     ON business_valuations(client_sharing_status);
CREATE INDEX IF NOT EXISTS idx_val_shared_version     ON business_valuations(shared_version_id);
CREATE INDEX IF NOT EXISTS idx_val_latest_published   ON business_valuations(latest_published_version_id);

CREATE INDEX IF NOT EXISTS idx_versions_valuation     ON valuation_versions(valuation_id);
CREATE INDEX IF NOT EXISTS idx_versions_status        ON valuation_versions(status);

CREATE INDEX IF NOT EXISTS idx_sections_valuation     ON valuation_sections(valuation_id);
CREATE INDEX IF NOT EXISTS idx_sections_section_key   ON valuation_sections(section_key);

CREATE INDEX IF NOT EXISTS idx_questions_key          ON valuation_questions(question_key);
CREATE INDEX IF NOT EXISTS idx_questions_section_key  ON valuation_questions(section_key);
CREATE INDEX IF NOT EXISTS idx_questions_active       ON valuation_questions(is_active);

CREATE INDEX IF NOT EXISTS idx_answers_valuation      ON valuation_answers(valuation_id);
CREATE INDEX IF NOT EXISTS idx_answers_question      ON valuation_answers(question_id);

CREATE INDEX IF NOT EXISTS idx_financials_valuation   ON valuation_financials(valuation_id);
CREATE INDEX IF NOT EXISTS idx_financials_period      ON valuation_financials(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_adjustments_valuation  ON valuation_adjustments(valuation_id);
CREATE INDEX IF NOT EXISTS idx_multiples_valuation    ON valuation_multiple_factors(valuation_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_valuation     ON valuation_scenarios(valuation_id);
CREATE INDEX IF NOT EXISTS idx_evidence_valuation      ON valuation_evidence(valuation_id);
CREATE INDEX IF NOT EXISTS idx_evidence_source        ON valuation_evidence(source_table, source_record_id);

CREATE INDEX IF NOT EXISTS idx_assignments_valuation  ON valuation_assignments(valuation_id);
CREATE INDEX IF NOT EXISTS idx_assignments_advisor    ON valuation_assignments(advisor_profile_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active     ON valuation_assignments(valuation_id, advisor_profile_id) WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_valuation         ON valuation_audit_log(valuation_id);
CREATE INDEX IF NOT EXISTS idx_audit_created          ON valuation_audit_log(created_at);

-- ── 6. RLS ENABLEMENT ───────────────────────────────────────────────────────

ALTER TABLE business_valuations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_sections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_answers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_financials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_adjustments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_multiple_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_scenarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_evidence         ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_audit_log        ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners
ALTER TABLE business_valuations        FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_versions         FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_sections         FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_questions        FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_answers          FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_financials       FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_adjustments      FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_multiple_factors FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_scenarios        FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_evidence         FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_assignments      FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation_audit_log        FORCE ROW LEVEL SECURITY;

-- ── 7. RLS HELPER FUNCTIONS ─────────────────────────────────────────────────
-- Fixed search_path, SECURITY DEFINER, scoped to valuation system only.

CREATE OR REPLACE FUNCTION valuation.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, valuation, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION valuation.valuation_assignment(vid uuid)
RETURNS table (
  can_view boolean, can_edit boolean, can_review boolean, can_publish boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, valuation, public
AS $$
  SELECT
    COALESCE(MAX(a.can_view), false),
    COALESCE(MAX(a.can_edit), false),
    COALESCE(MAX(a.can_review), false),
    COALESCE(MAX(a.can_publish), false)
  FROM valuation_assignments a
  WHERE a.valuation_id = vid
    AND a.advisor_profile_id = auth.uid()
    AND a.removed_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION valuation.has_valuation_view(vid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, valuation, public
AS $$ SELECT valuation.is_super_admin() OR (valuation.valuation_assignment(vid)).can_view; $$;

CREATE OR REPLACE FUNCTION valuation.has_valuation_edit(vid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, valuation, public
AS $$ SELECT valuation.is_super_admin() OR (valuation.valuation_assignment(vid)).can_edit; $$;

CREATE OR REPLACE FUNCTION valuation.has_valuation_review(vid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, valuation, public
AS $$ SELECT valuation.is_super_admin() OR (valuation.valuation_assignment(vid)).can_review; $$;

CREATE OR REPLACE FUNCTION valuation.has_valuation_publish(vid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, valuation, public
AS $$ SELECT valuation.is_super_admin() OR (valuation.valuation_assignment(vid)).can_publish; $$;

-- Business access helper (owner / team_member of the business)
CREATE OR REPLACE FUNCTION valuation.has_business_access(bid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, valuation, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_owners bo
    WHERE bo.business_id = bid
      AND bo.profile_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.primary_business_id = bid
  ) OR valuation.is_super_admin();
$$;

-- ── 8. RLS POLICIES ─────────────────────────────────────────────────────────
-- Clients have NO direct access to any valuation table.
-- Client summary access is ONLY through the backend RPC (getSharedClientSummary).

-- business_valuations
CREATE POLICY val_bv_select ON business_valuations FOR SELECT
  USING (valuation.is_super_admin() OR valuation.has_valuation_view(id));
CREATE POLICY val_bv_insert ON business_valuations FOR INSERT
  WITH CHECK (valuation.is_super_admin());
CREATE POLICY val_bv_update ON business_valuations FOR UPDATE
  USING (valuation.is_super_admin() OR valuation.has_valuation_edit(id))
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(id));
CREATE POLICY val_bv_delete ON business_valuations FOR DELETE
  USING (valuation.is_super_admin());

-- valuation_versions — SELECT only; INSERT via RPC; NO UPDATE/DELETE ever
CREATE POLICY val_ver_select ON valuation_versions FOR SELECT
  USING (valuation.is_super_admin() OR valuation.has_valuation_view(valuation_id));
CREATE POLICY val_ver_insert ON valuation_versions FOR INSERT
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_publish(valuation_id));
-- No UPDATE policy. No DELETE policy. Published rows immutable.

-- valuation_sections
CREATE POLICY val_sec_select ON valuation_sections FOR SELECT
  USING (valuation.is_super_admin() OR valuation.has_valuation_view(valuation_id));
CREATE POLICY val_sec_insert ON valuation_sections FOR INSERT
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_sec_update ON valuation_sections FOR UPDATE
  USING (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id))
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_sec_delete ON valuation_sections FOR DELETE
  USING (valuation.is_super_admin());

-- valuation_questions — global definitions; read by any authenticated user
CREATE POLICY val_q_select ON valuation_questions FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY val_q_insert ON valuation_questions FOR INSERT
  WITH CHECK (valuation.is_super_admin());
CREATE POLICY val_q_update ON valuation_questions FOR UPDATE
  USING (valuation.is_super_admin())
  WITH CHECK (valuation.is_super_admin());
CREATE POLICY val_q_delete ON valuation_questions FOR DELETE
  USING (valuation.is_super_admin());

-- valuation_answers
CREATE POLICY val_ans_select ON valuation_answers FOR SELECT
  USING (valuation.is_super_admin() OR valuation.has_valuation_view(valuation_id));
CREATE POLICY val_ans_insert ON valuation_answers FOR INSERT
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_ans_update ON valuation_answers FOR UPDATE
  USING (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id))
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_ans_delete ON valuation_answers FOR DELETE
  USING (valuation.is_super_admin());

-- valuation_financials
CREATE POLICY val_fin_select ON valuation_financials FOR SELECT
  USING (valuation.is_super_admin() OR valuation.has_valuation_view(valuation_id));
CREATE POLICY val_fin_insert ON valuation_financials FOR INSERT
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_fin_update ON valuation_financials FOR UPDATE
  USING (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id))
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_fin_delete ON valuation_financials FOR DELETE
  USING (valuation.is_super_admin());

-- valuation_adjustments
CREATE POLICY val_adj_select ON valuation_adjustments FOR SELECT
  USING (valuation.is_super_admin() OR valuation.has_valuation_view(valuation_id));
CREATE POLICY val_adj_insert ON valuation_adjustments FOR INSERT
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_adj_update ON valuation_adjustments FOR UPDATE
  USING (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id))
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_adj_delete ON valuation_adjustments FOR DELETE
  USING (valuation.is_super_admin());

-- valuation_multiple_factors
CREATE POLICY val_mf_select ON valuation_multiple_factors FOR SELECT
  USING (valuation.is_super_admin() OR valuation.has_valuation_view(valuation_id));
CREATE POLICY val_mf_insert ON valuation_multiple_factors FOR INSERT
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_mf_update ON valuation_multiple_factors FOR UPDATE
  USING (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id))
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_mf_delete ON valuation_multiple_factors FOR DELETE
  USING (valuation.is_super_admin());

-- valuation_scenarios
CREATE POLICY val_sc_select ON valuation_scenarios FOR SELECT
  USING (valuation.is_super_admin() OR valuation.has_valuation_view(valuation_id));
CREATE POLICY val_sc_insert ON valuation_scenarios FOR INSERT
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_sc_update ON valuation_scenarios FOR UPDATE
  USING (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id))
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_sc_delete ON valuation_scenarios FOR DELETE
  USING (valuation.is_super_admin());

-- valuation_evidence
CREATE POLICY val_ev_select ON valuation_evidence FOR SELECT
  USING (valuation.is_super_admin() OR valuation.has_valuation_view(valuation_id));
CREATE POLICY val_ev_insert ON valuation_evidence FOR INSERT
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_ev_update ON valuation_evidence FOR UPDATE
  USING (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id))
  WITH CHECK (valuation.is_super_admin() OR valuation.has_valuation_edit(valuation_id));
CREATE POLICY val_ev_delete ON valuation_evidence FOR DELETE
  USING (valuation.is_super_admin());

-- valuation_assignments — only super_admin can manage; assigned advisors can read their own
CREATE POLICY val_asg_select ON valuation_assignments FOR SELECT
  USING (valuation.is_super_admin() OR advisor_profile_id = auth.uid());
CREATE POLICY val_asg_insert ON valuation_assignments FOR INSERT
  WITH CHECK (valuation.is_super_admin());
CREATE POLICY val_asg_update ON valuation_assignments FOR UPDATE
  USING (valuation.is_super_admin())
  WITH CHECK (valuation.is_super_admin());
CREATE POLICY val_asg_delete ON valuation_assignments FOR DELETE
  USING (valuation.is_super_admin());

-- valuation_audit_log — append-only; super_admin reads all
CREATE POLICY val_audit_select ON valuation_audit_log FOR SELECT
  USING (valuation.is_super_admin());
CREATE POLICY val_audit_insert ON valuation_audit_log FOR INSERT
  WITH CHECK (valuation.is_super_admin());
-- No UPDATE. No DELETE.

-- ── 9. IMMUTABILITY TRIGGER (published versions) ────────────────────────────

CREATE OR REPLACE FUNCTION valuation.enforce_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, valuation, public
AS $$
BEGIN
  -- Block ALL updates and deletes on published version rows.
  -- New versions are inserted with status='published' already set; INSERT is not blocked.
  RAISE EXCEPTION 'Published valuation versions are immutable. (action=%)', TG_OP;
END;
$$;

CREATE TRIGGER trg_version_immutable_update
  BEFORE UPDATE ON valuation_versions
  FOR EACH ROW EXECUTE FUNCTION valuation.enforce_version_immutability();

CREATE TRIGGER trg_version_immutable_delete
  BEFORE DELETE ON valuation_versions
  FOR EACH ROW EXECUTE FUNCTION valuation.enforce_version_immutability();

-- ── 10. CLIENT SUMMARY RPC ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION valuation.getSharedClientSummary(p_business_id uuid)
RETURNS table (
  valuation_id      uuid,
  business_id       uuid,
  version_id        uuid,
  version_number    integer,
  valuation_date    date,
  published_at      timestamptz,
  client_snapshot   jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, valuation, public
AS $$
DECLARE
  v_val business_valuations%ROWTYPE;
  v_ver valuation_versions%ROWTYPE;
BEGIN
  -- 1. Authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2. Business access
  IF NOT valuation.has_business_access(p_business_id) THEN
    RAISE EXCEPTION 'BUSINESS_ACCESS_DENIED';
  END IF;

  SELECT * INTO v_val FROM business_valuations WHERE business_id = p_business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VALUATION_NOT_FOUND'; END IF;

  -- 3. Sharing state
  IF v_val.client_sharing_status <> 'shared' THEN
    RAISE EXCEPTION 'NOT_SHARED';
  END IF;
  IF v_val.shared_version_id IS NULL THEN
    RAISE EXCEPTION 'NO_SHARED_VERSION';
  END IF;
  IF v_val.status = 'archived' THEN
    RAISE EXCEPTION 'VALUATION_ARCHIVED';
  END IF;

  SELECT * INTO v_ver FROM valuation_versions WHERE id = v_val.shared_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VERSION_NOT_FOUND'; END IF;

  -- 4. Version integrity
  IF v_ver.valuation_id <> v_val.id THEN
    RAISE EXCEPTION 'VERSION_MISMATCH';
  END IF;
  IF v_ver.status <> 'published' THEN
    RAISE EXCEPTION 'VERSION_NOT_PUBLISHED';
  END IF;

  -- 5. Return client-safe payload only
  RETURN QUERY SELECT
    v_val.id, p_business_id, v_ver.id, v_ver.version_number,
    v_val.valuation_date, v_ver.published_at, v_ver.client_snapshot_data;
END;
$$;

REVOKE ALL ON FUNCTION valuation.getSharedClientSummary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION valuation.getSharedClientSummary(uuid) TO authenticated;

-- ── 11. GRANTS ──────────────────────────────────────────────────────────────
-- Authenticated users get table-level access; RLS policies gate row-level.
GRANT SELECT, INSERT, UPDATE, DELETE ON business_valuations        TO authenticated;
GRANT SELECT, INSERT               ON valuation_versions         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_sections         TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON valuation_questions       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_answers         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_financials      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_adjustments     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_multiple_factors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_scenarios       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_evidence        TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON valuation_assignments    TO authenticated;
GRANT SELECT, INSERT                 ON valuation_audit_log      TO authenticated;
GRANT USAGE ON SCHEMA valuation TO authenticated;

COMMIT;
```

---

## Section 4 — Full RLS Matrix

Legend: ✅ = allowed (via RLS policy) · ❌ = denied · RPC = backend-mediated only · — = N/A

| Table | super_admin | Assigned (can_view) | Assigned (can_edit) | Assigned (can_review) | Assigned (can_publish) | Unassigned advisor | Expert Advisor (no assignment) | Client owner | Client team member | Anonymous |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **business_valuations** | | | | | | | | | | |
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_versions** | | | | | | | | | | |
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_sections** | | | | | | | | | | |
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_questions** | | | | | | | | | | |
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_answers** | | | | | | | | | | |
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_financials** | | | | | | | | | | |
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_adjustments** | | | | | | | | | | |
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_multiple_factors** | | | | | | | | | | |
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_scenarios** | | | | | | | | | | |
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_evidence** | | | | | | | | | | |
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_assignments** | | | | | | | | | | |
| SELECT | ✅ | own row only | own row only | own row only | own row only | own row only | own row only | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **valuation_audit_log** | | | | | | | | | | |
| SELECT | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Client access:** No direct table access to any of the 12 tables. Shared summary access is **only** through `valuation.getSharedClientSummary(business_id)` RPC, which returns `client_snapshot_data` exclusively.

**Unassigned advisor discovery:** Unassigned advisors get ❌ on all SELECT policies for valuation-scoped tables (policies require `has_valuation_view(id)` which checks the assignment). They cannot list or discover other clients' valuations. `valuation_questions` is the only globally readable table (question definitions only — no business data).

---

## Section 5 — Backend Function Contracts

All functions are **Base44 backend functions** (`base44/functions/{name}/entry.ts`) that invoke Supabase via the service-role client. Sensitive transitions are backend-mediated; the frontend never performs authoritative writes to valuation state tables directly.

### 1. `createValuation`
- **Input:** `{ business_id: uuid, lead_advisor_profile_id?: uuid }`
- **Output:** `{ valuation_id: uuid }`
- **Required:** `super_admin` (or advisor with business access — TBD per policy)
- **Validation:** business_id exists in `business_entities`; caller has business access; no existing non-archived valuation for business (or allows multiple — TBD)
- **Lifecycle:** sets `status = 'draft'`, `client_sharing_status = 'not_shared'`
- **Audit:** `action_type = 'valuation_created'`
- **Failures:** `BUSINESS_NOT_FOUND`, `BUSINESS_ACCESS_DENIED`, `DUPLICATE_ACTIVE_VALUATION`

### 2. `updateValuationStatus`
- **Input:** `{ valuation_id: uuid, new_status: string }`
- **Output:** `{ status: string }`
- **Required:** `super_admin` OR assigned advisor with `can_edit`
- **Validation:** transition is valid per lifecycle graph; valuation not archived
- **Audit:** `action_type = 'status_changed'`, `old_value`/`new_value`
- **Failures:** `INVALID_TRANSITION`, `VALUATION_ARCHIVED`, `PERMISSION_DENIED`

### 3. `assignValuationAdvisor`
- **Input:** `{ valuation_id: uuid, advisor_profile_id: uuid, assignment_role, can_view, can_edit, can_review, can_publish }`
- **Output:** `{ assignment_id: uuid }`
- **Required:** `super_admin`
- **Validation:** advisor exists in `profiles` with role `advisor`/`super_admin`; no existing active assignment for same (valuation_id, advisor_profile_id)
- **Audit:** `action_type = 'advisor_assigned'`
- **Failures:** `ADVISOR_PROFILE_NOT_FOUND`, `DUPLICATE_ACTIVE_ASSIGNMENT`

### 4. `updateValuationAssignment`
- **Input:** `{ assignment_id: uuid, can_view?, can_edit?, can_review?, can_publish?, assignment_role? }`
- **Output:** `{ assignment_id }`
- **Required:** `super_admin`
- **Validation:** assignment exists and `removed_at IS NULL`
- **Audit:** `action_type = 'assignment_updated'`
- **Failures:** `ASSIGNMENT_NOT_FOUND`, `ASSIGNMENT_INACTIVE`

### 5. `removeValuationAdvisor`
- **Input:** `{ assignment_id: uuid }`
- **Output:** `{ assignment_id, removed_at }`
- **Required:** `super_admin`
- **Logic:** sets `removed_at = now()`, zeroes all permission flags (satisfies CHECK constraint)
- **Audit:** `action_type = 'advisor_removed'`
- **Failures:** `ASSIGNMENT_NOT_FOUND`, `ALREADY_REMOVED`

### 6. `saveValuationAnswer`
- **Input:** `{ valuation_id, question_id, answer_value, document_ref_id? }`
- **Output:** `{ answer_id }`
- **Required:** `super_admin` OR `can_edit`
- **Validation:** answer_type validation per `valuation_questions.answer_type` (currency=numeric, percentage range, single_select in options, multi_select all in options, document_reference belongs to same business); `UNIQUE (valuation_id, question_id)` enforced
- **Audit:** `action_type = 'answer_saved'`
- **Failures:** `VALIDATION_FAILED`, `DUPLICATE_ANSWER`, `DOCUMENT_NOT_AUTHORIZED`

### 7. `saveValuationFinancial`
- **Input:** `{ valuation_id, period_type, period_start, period_end, fiscal_year?, revenue?, ... }`
- **Output:** `{ financial_id }`
- **Required:** `super_admin` OR `can_edit`
- **Validation:** `period_end >= period_start`; `UNIQUE (valuation_id, period_start, period_end, period_type)`
- **Audit:** `action_type = 'financial_saved'`
- **Failures:** `INVALID_PERIOD`, `DUPLICATE_PERIOD`

### 8. `saveValuationAdjustment`
- **Input:** `{ valuation_id, financial_id?, adjustment_category, amount, adjustment_direction, evidence_doc_id? }`
- **Output:** `{ adjustment_id }`
- **Required:** `super_admin` OR `can_edit`
- **Validation:** `evidence_doc_id` (if present) belongs to same business
- **Audit:** `action_type = 'adjustment_saved'`

### 9. `saveValuationMultipleFactor`
- **Input:** `{ valuation_id, factor_key, multiple_adjustment, rationale? }`
- **Output:** `{ factor_id }`
- **Required:** `super_admin` OR `can_edit`
- **Audit:** `action_type = 'multiple_factor_saved'`

### 10. `saveValuationScenario`
- **Input:** `{ valuation_id, scenario_type, enterprise_value_low?, enterprise_value_high?, ... }`
- **Output:** `{ scenario_id }`
- **Required:** `super_admin` OR `can_edit`
- **Audit:** `action_type = 'scenario_saved'`

### 11. `publishValuation`  ⭐ (server-constructed snapshot)
- **Input:** `{ valuation_id, publication_options: { client_summary_text?, disclosures?, visibility?, advisor_display_info? } }`
- **Output:** `{ version_id, version_number, published_at }`
- **Required:** `super_admin` OR assigned advisor with `can_publish`
- **Logic (atomic, inside transaction):**
  1. Authenticate acting user
  2. Confirm `can_publish = true` or `super_admin`
  3. Confirm valuation `status` is `ready_to_publish` (or `published` for republish)
  4. Load valuation, verify `business_id`
  5. Load approved financials (`is_approved = true`)
  6. Load approved adjustments (`is_approved = true`)
  7. Load approved methodology selections
  8. Load approved multiple factors (`is_approved = true`)
  9. Load approved scenarios (`is_approved = true`)
  10. Load approved client summary settings from `publication_options`
  11. Construct `internal_snapshot_data` server-side from DB records
  12. Construct `client_snapshot_data` server-side from approved + client-visible fields only
  13. Calculate next `version_number` atomically: `SELECT COALESCE(MAX(version_number),0)+1 FROM valuation_versions WHERE valuation_id=? FOR UPDATE` (row lock on valuation)
  14. INSERT new `valuation_versions` row with `status = 'published'`
  15. UPDATE `business_valuations.latest_published_version_id`
  16. Append audit `action_type = 'version_published'`
  17. Return new version
- **Concurrency:** `UNIQUE (valuation_id, version_number)` + row lock prevents duplicates; on conflict, retry once or return `VERSION_CONFLICT`
- **Failures:** `PERMISSION_DENIED`, `INVALID_LIFECYCLE_STATE`, `NO_APPROVED_DATA`, `VERSION_CONFLICT`

### 12. `shareValuation`
- **Input:** `{ valuation_id, version_id }`
- **Output:** `{ shared_version_id, shared_at }`
- **Required:** `super_admin` OR `can_publish`
- **Validation:** version belongs to valuation; version `status = 'published'`; valuation not archived
- **Logic:** set `client_sharing_status = 'shared'`, `shared_version_id = version_id`, `last_shared_version_id = version_id`, `shared_at = now()`, clear `sharing_revoked_at`
- **Audit:** `action_type = 'valuation_shared'`
- **Failures:** `VERSION_NOT_PUBLISHED`, `VERSION_MISMATCH`, `VALUATION_ARCHIVED`

### 13. `revokeClientAccess`
- **Input:** `{ valuation_id }`
- **Output:** `{ client_sharing_status, sharing_revoked_at }`
- **Required:** `super_admin` OR `can_publish`
- **Logic:** set `client_sharing_status = 'revoked'`, `sharing_revoked_at = now()`, preserve `last_shared_version_id`, clear `shared_version_id` (so client route no longer resolves)
- **Preserves:** published version untouched; audit log retains previous shared version
- **Audit:** `action_type = 'access_revoked'`, `old_value = { shared_version_id }`
- **Failures:** `NOT_CURRENTLY_SHARED`

### 14. `getSharedClientSummary`
- **Input:** `{ business_id }`
- **Output:** `{ valuation_id, business_id, version_id, version_number, valuation_date, published_at, client_summary_snapshot, advisor_display_info }`
- **Required:** authenticated user with business access (owner / team_member / super_admin)
- **Validation:** all checks from Section 1 of the user's correction #10 (client_sharing_status='shared', shared_version_id NOT NULL, version belongs to valuation, version published, not archived, not revoked)
- **Returns:** ONLY `client_snapshot_data` fields. Never `internal_snapshot_data`, never assignments, never audit, never draft answers.
- **Failures:** `AUTH_REQUIRED`, `BUSINESS_ACCESS_DENIED`, `VALUATION_NOT_FOUND`, `NOT_SHARED`, `VALUATION_ARCHIVED`, `VERSION_NOT_PUBLISHED`

### 15. `archiveValuation`
- **Input:** `{ valuation_id }`
- **Output:** `{ status, archived_at }`
- **Required:** `super_admin`
- **Logic:** set `status = 'archived'`, `archived_at = now()`, `archived_by = auth.uid()`; if currently shared, also revoke (`client_sharing_status = 'revoked'`)
- **Audit:** `action_type = 'valuation_archived'`
- **Failures:** `PERMISSION_DENIED`, `ALREADY_ARCHIVED`

### 16. `restoreArchivedValuation`
- **Input:** `{ valuation_id }`
- **Output:** `{ status }`
- **Required:** `super_admin`
- **Logic:** set `status = 'ready_to_publish'` (or last non-archived state), clear `archived_at`; does NOT restore sharing (must re-share explicitly)
- **Audit:** `action_type = 'valuation_restored'`
- **Failures:** `PERMISSION_DENIED`, `NOT_ARCHIVED`

### 17. `appendValuationAuditEvent`
- **Input:** `{ valuation_id, action_type, old_value?, new_value?, metadata? }`
- **Output:** `{ audit_id }`
- **Required:** `super_admin` (called internally by other functions)
- **Logic:** INSERT into `valuation_audit_log` (append-only; no UPDATE/DELETE policy exists)
- **Failures:** `PERMISSION_DENIED`

### Implementation Mapping

| Action | Mechanism |
| :--- | :--- |
| All 17 functions above | Base44 backend function (`base44/functions/valuationService/entry.ts`) using service-role Supabase client |
| `getSharedClientSummary` | Also exposed as Supabase RPC `valuation.getSharedClientSummary(uuid)` for direct authenticated call (client-safe only) |
| Read working data (sections, answers, financials) | Direct authenticated table operations (RLS-gated) for advisor workspace UI |
| Question definitions | Direct SELECT on `valuation_questions` (any authenticated user) |

---

## Section 6 — Snapshot JSON Schemas

### Internal Snapshot (`internal_snapshot_data`)

```json
{
  "publication_metadata": {
    "valuation_id": "uuid",
    "version_number": 3,
    "published_at": "2026-08-04T18:20:00Z",
    "published_by": "uuid",
    "valuation_date": "2026-07-31"
  },
  "financial_history": [
    {
      "period_type": "trailing_twelve_months",
      "period_start": "2025-08-01",
      "period_end": "2026-07-31",
      "revenue": 2400000.00,
      "ebitda": 480000.00,
      "recast_ebitda": 612000.00,
      "add_backs_total": 132000.00
    }
  ],
  "adjustments": [
    { "category": "owner_compensation", "direction": "add_back", "amount": 120000.00, "evidence_doc_id": "uuid" }
  ],
  "methodology_selections": { "primary_method": "market_multiple", "secondary_method": "income" },
  "multiple_factors": [
    { "factor_key": "industry_growth", "multiple_adjustment": 0.5, "rationale": "..." }
  ],
  "scenarios": [
    { "scenario_type": "defensible", "enterprise_value_low": 1800000, "enterprise_value_high": 2200000 }
  ],
  "advisor_conclusions": "Internal reasoning text...",
  "evidence_references": [
    { "source_table": "documents", "source_record_id": "uuid", "confidence_score": 88 }
  ],
  "confidence_calculations": { "overall_confidence": 82, "data_completeness": 90 }
}
```

### Client Summary Snapshot (`client_snapshot_data`)

```json
{
  "valuation_date": "2026-07-31",
  "version_number": 3,
  "publication_date": "2026-08-04T18:20:00Z",
  "value_ranges": {
    "current_indicated": { "low": 1900000, "high": 2100000 },
    "defensible":        { "low": 1800000, "high": 2000000 },
    "potential":         { "low": 2400000, "high": 2800000 }
  },
  "estimated_value_gap": 600000,
  "normalized_earnings_summary": {
    "recast_ebitda": 612000,
    "add_backs_total": 132000
  },
  "methodology_summary": "Market multiple approach benchmarked against comparable mid-market transactions, cross-checked with income approach.",
  "confidence": { "score": 82, "explanation": "Based on 3 years of reviewed financials and industry benchmarks." },
  "value_drivers": ["Recurring revenue base", "Strong gross margins", "Experienced management team"],
  "risks": ["Customer concentration in top 3 accounts", "Owner-dependent relationships"],
  "opportunities": ["Expand into adjacent market", "Implement pricing optimization"],
  "advisor_commentary": "Your business shows defensible EBITDA strength. Closing the value gap requires reducing customer concentration and documenting owner-independent processes.",
  "recommended_next_steps": [
    "Reduce top-3 customer concentration below 30%",
    "Complete operations assessment",
    "Re-engage in 90 days for updated valuation"
  ],
  "disclosures": "This valuation is an indicative estimate for strategic planning, not a formal appraisal.",
  "advisor_display_info": {
    "name": "Jane Doe, CEPA",
    "company": "Acme Advisory",
    "title": "Exit Planning Advisor"
  }
}
```

**No internal notes, evidence references, confidence calculations, or adjustment evidence are placed in `client_snapshot_data`.**

---

## Section 7 — Exact Frontend Files to Create or Modify

### Files to CREATE

| File | Purpose |
| :--- | :--- |
| `src/pages/advisory/BusinessValuation.jsx` | Admin/advisor landing page (valuation list + create) |
| `src/components/valuation/ValuationWorkspaceShell.jsx` | Tabbed workspace container (sections, financials, adjustments, scenarios, publish) |
| `src/components/valuation/ValuationSections.jsx` | Section/question answer UI |
| `src/components/valuation/ValuationFinancials.jsx` | Financial period entry |
| `src/components/valuation/ValuationAdjustments.jsx` | Adjustment entry |
| `src/components/valuation/ValuationScenarios.jsx` | Scenario entry |
| `src/components/valuation/ValuationPublishPanel.jsx` | Publish + share + revoke controls |
| `src/components/valuation/ClientValuationSummary.jsx` | Client-facing read-only summary view |
| `src/lib/valuationService.js` | Frontend wrapper calling `base44.functions.invoke('valuationService', { action, ... })` |
| `base44/functions/valuationService/entry.ts` | Backend function (all 17 actions) |
| `src/supabase/migrations/business_valuation.sql` | The SQL migration above |

### Files to MODIFY (exact, verified)

| File | Change |
| :--- | :--- |
| `src/components/layout/Sidebar.jsx` | Add "Business Valuation" item to `advisoryItems` (after Resource Library, before Data Room) — `{ icon: Calculator, label: 'Business Valuation', path: '/advisory/business-valuation', isAdvisory: true }` |
| `src/App.jsx` | Add two routes: `/advisory/business-valuation` → `BusinessValuation` (protected, AppLayout); `/advisory/valuation/:valuationId` → `ValuationWorkspaceShell`; `/valuation/summary/:businessId` → `ClientValuationSummary` (client-facing) |

**No other files modified.** No existing table, RLS policy, assessment schema, or document extraction table is touched.

---

## Section 8 — Validation Queries (Non-Destructive)

```sql
-- 1. All 12 tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'business_valuations','valuation_versions','valuation_sections','valuation_questions',
  'valuation_answers','valuation_financials','valuation_adjustments','valuation_multiple_factors',
  'valuation_scenarios','valuation_evidence','valuation_assignments','valuation_audit_log'
);
-- Expect: 12 rows

-- 2. Foreign keys exist
SELECT conname FROM pg_constraint WHERE contype = 'f'
AND conrelid IN (
  'business_valuations'::regclass, 'valuation_versions'::regclass,
  'valuation_assignments'::regclass, 'valuation_answers'::regclass
);
-- Expect: multiple FK rows

-- 3. RLS enabled + forced
SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'valuation_%' OR tablename = 'business_valuations';
-- Expect: rowsecurity = true, forcerowsecurity = true for all 12

-- 4. Policies exist
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND (tablename LIKE 'valuation_%' OR tablename = 'business_valuations');
-- Expect: SELECT/INSERT/UPDATE/DELETE policies per table

-- 5. Indexes exist
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND (tablename LIKE 'valuation_%' OR tablename = 'business_valuations');
-- Expect: includes uq_version_number, uq_section_key, uq_answer, uq_financial_period, uq_question_key, uq_active_assignment

-- 6. Immutability trigger exists
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'valuation_versions'::regclass AND tgisinternal = false;
-- Expect: trg_version_immutable_update, trg_version_immutable_delete

-- 7. Version-reference columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'business_valuations'
AND column_name IN ('shared_version_id','last_shared_version_id','latest_published_version_id');
-- Expect: 3 rows

-- 8. Version numbers unique per valuation
SELECT conname FROM pg_constraint
WHERE contype = 'u' AND conrelid = 'valuation_versions'::regclass;
-- Expect: uq_version_number

-- 9. Active assignment uniqueness
SELECT indexname FROM pg_indexes
WHERE indexname = 'uq_active_assignment';
-- Expect: 1 row (partial unique index)

-- 10. Currency fields use NUMERIC(19,4)
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'valuation_financials' AND column_name = 'revenue';
-- Expect: numeric, 19, 4

-- 11. Score constraints active
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'valuation_evidence'::regclass AND contype = 'c';
-- Expect: confidence_score >= 0 AND <= 100
```

---

## Section 9 — Rollback Notes (Do NOT execute; reference only)

**⚠️ WARNING:** Rollback must NOT be performed after real production valuation data exists without a full export and preservation plan. Rollback drops all valuation data irreversibly.

Safe reverse order (if required pre-production):

1. **Revoke grants** — `REVOKE ... FROM authenticated` on all tables + RPC
2. **Drop policies** — `DROP POLICY` for every `val_*` policy (12 tables)
3. **Drop triggers** — `DROP TRIGGER trg_version_immutable_update`, `trg_version_immutable_delete` on `valuation_versions`
4. **Drop helper functions** — `DROP FUNCTION valuation.getSharedClientSummary(uuid)`, `valuation.enforce_version_immutability()`, `valuation.has_business_access()`, `valuation.has_valuation_publish()`, `valuation.has_valuation_review()`, `valuation.has_valuation_edit()`, `valuation.has_valuation_view()`, `valuation.valuation_assignment()`, `valuation.is_super_admin()`
5. **Drop circular foreign keys** — `ALTER TABLE business_valuations DROP CONSTRAINT fk_val_shared_version, DROP CONSTRAINT fk_val_last_shared_version, DROP CONSTRAINT fk_val_latest_published_version`
6. **Drop child tables** (reverse dependency order): `valuation_audit_log`, `valuation_assignments`, `valuation_evidence`, `valuation_scenarios`, `valuation_multiple_factors`, `valuation_adjustments`, `valuation_financials`, `valuation_answers`, `valuation_questions`, `valuation_sections`
7. **Drop version table** — `DROP TABLE valuation_versions`
8. **Drop root table** — `DROP TABLE business_valuations`
9. **Drop schema** — `DROP SCHEMA IF EXISTS valuation`

No destructive rollback statements are included in the forward migration.

---

## Section 10 — Remaining Unresolved Assumptions

1. **`profiles.id` column type:** Assumed `uuid`. To be confirmed via `checkProfilesSchema` backend function output before execution. If `profiles.id` is not `uuid`, all FK references must be adjusted.

2. **`business_owners` table structure:** The `has_business_access` helper assumes a `business_owners` table with `(business_id, profile_id)` columns (confirmed by `AuthContext.resolveBusinessContext` which queries `getBusinessOwnership`). Exact column types to be verified.

3. **Multiple valuations per business:** The schema permits multiple valuations per `business_id` (no unique constraint). If the product requires one active valuation per business, a partial unique index `WHERE status != 'archived'` should be added. **Decision needed.**

4. **`documents` table for `document_reference` answers:** `valuation_answers.document_ref_id` and `valuation_adjustments.evidence_doc_id` are soft references (no hard FK) to preserve metadata if documents are deleted. Backend validation will confirm the document belongs to the same `business_id` at write time. The `documents` table is the Base44 `Document` entity — its Supabase table name and `business_id` column to be confirmed.

5. **`authenticated` role:** The Supabase grant statements assume an `authenticated` role exists (standard Supabase convention). To be confirmed against the live database.

6. **Schema placement:** Helper functions use a `valuation` schema. If the project convention requires all functions in `public`, the schema prefix must be removed and `CREATE SCHEMA valuation` added. **Decision needed.**

---

**END OF REVIEW PACKAGE — AWAITING APPROVAL TO EXECUTE**