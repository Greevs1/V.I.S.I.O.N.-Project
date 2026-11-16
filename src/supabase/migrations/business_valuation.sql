-- ============================================================================
-- Phase 13.1A — Business Valuation Migration (CORRECTED)
-- ============================================================================
-- This migration is ADDITIVE. It creates a dedicated `valuation` schema with
-- 14 tables (12 original + 2 new: valuation_calculations, valuation_value_drivers).
--
-- CORRECTIONS APPLIED (per Phase 13.1A review):
--   1.  Identity mapping: auth.uid() → profiles.auth_user_id → profiles.id
--   2.  Explicit CREATE SCHEMA valuation with grants
--   3.  Publication concurrency: SELECT FOR UPDATE on parent row
--   4.  Shared-valuation: deterministic query + partial unique index
--   5.  Multiple engagements: valuation_name, valuation_type, is_primary, engagement_date
--   6.  Expanded scenario types
--   7.  Expanded financial fields (NUMERIC(19,4))
--   8.  Strengthened adjustment records
--   9.  Strengthened evidence records (allowlisted source_type)
--   10. New tables: valuation_calculations, valuation_value_drivers
--   11. Engine/methodology versioning in snapshot
--   12. Document FK with ON DELETE SET NULL
--
-- IDENTITY MAPPING CONFIRMED:
--   profiles.id           = profile UUID (PK)
--   profiles.auth_user_id = Supabase auth user UUID (maps to auth.uid())
--   profiles.base44_user_id = Base44 user ID
--   profiles.app_role     = role column (owner, advisor, admin, super_admin)
--   profiles.first_name / last_name (NOT full_name)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE SCHEMA
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS valuation;

-- Set ownership to postgres (service role)
ALTER SCHEMA valuation OWNER TO postgres;

-- Revoke unrestricted access from PUBLIC
REVOKE ALL ON SCHEMA valuation FROM PUBLIC;

-- Grant usage to authenticated role
GRANT USAGE ON SCHEMA valuation TO authenticated;

-- ============================================================================
-- 2. IDENTITY MAPPING HELPERS
-- ============================================================================

-- valuation.current_profile_id()
-- Resolves auth.uid() → profiles.id via profiles.auth_user_id
-- Returns NULL when no valid profile exists
-- Uses fixed search path to avoid recursion
CREATE OR REPLACE FUNCTION valuation.current_profile_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- auth.uid() gives the Supabase auth user UUID
  -- profiles.auth_user_id maps to that UUID
  -- profiles.id is the canonical profile UUID
  SELECT p.id INTO v_profile_id
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  RETURN v_profile_id;
END;
$$;

-- valuation.is_super_admin()
-- Checks if the current user has super_admin role
CREATE OR REPLACE FUNCTION valuation.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT p.app_role INTO v_role
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  RETURN v_role = 'super_admin';
END;
$$;

-- valuation.is_advisor_or_admin()
-- Checks if the current user is an advisor, admin, or super_admin
CREATE OR REPLACE FUNCTION valuation.is_advisor_or_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT p.app_role INTO v_role
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  RETURN v_role IN ('advisor', 'admin', 'super_admin');
END;
$$;

-- valuation.has_business_access(p_business_id UUID)
-- Checks if the current profile owns or is assigned to the business
CREATE OR REPLACE FUNCTION valuation.has_business_access(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_profile_id UUID;
  v_is_advisor BOOLEAN;
  v_has_ownership BOOLEAN;
  v_is_assigned BOOLEAN;
BEGIN
  v_profile_id := valuation.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Super admins have access to all businesses
  IF valuation.is_super_admin() THEN
    RETURN TRUE;
  END IF;

  -- Check ownership via business_owners table
  SELECT EXISTS(
    SELECT 1 FROM public.business_owners
    WHERE business_id = p_business_id
    AND profile_id = v_profile_id
    AND (end_date IS NULL OR end_date > NOW())
  ) INTO v_has_ownership;

  IF v_has_ownership THEN
    RETURN TRUE;
  END IF;

  -- Check advisor assignment via business_entities.assigned_advisor_id
  SELECT EXISTS(
    SELECT 1 FROM public.business_entities
    WHERE id = p_business_id
    AND assigned_advisor_id = v_profile_id
  ) INTO v_is_assigned;

  RETURN v_is_assigned;
END;
$$;

-- Grant execute on helpers to authenticated
GRANT EXECUTE ON FUNCTION valuation.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION valuation.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION valuation.is_advisor_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION valuation.has_business_access(UUID) TO authenticated;

-- ============================================================================
-- 3. VALUATION ASSIGNMENT HELPER
-- ============================================================================

-- valuation.can_view_valuation(p_valuation_id UUID)
CREATE OR REPLACE FUNCTION valuation.can_view_valuation(p_valuation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_profile_id UUID;
  v_business_id UUID;
  v_is_archived BOOLEAN;
BEGIN
  v_profile_id := valuation.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF valuation.is_super_admin() THEN
    RETURN TRUE;
  END IF;

  -- Get the valuation's business_id
  SELECT business_id, status INTO v_business_id, v_is_archived
  FROM valuation.business_valuations
  WHERE id = p_valuation_id;

  IF v_business_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Business owner or assigned advisor can view
  IF valuation.has_business_access(v_business_id) THEN
    RETURN TRUE;
  END IF;

  -- Check explicit valuation assignment
  RETURN EXISTS(
    SELECT 1 FROM valuation.valuation_assignments
    WHERE valuation_id = p_valuation_id
    AND assigned_profile_id = v_profile_id
    AND removed_at IS NULL
    AND can_view = TRUE
  );
END;
$$;

-- valuation.can_edit_valuation(p_valuation_id UUID)
CREATE OR REPLACE FUNCTION valuation.can_edit_valuation(p_valuation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_profile_id UUID;
  v_business_id UUID;
  v_status TEXT;
BEGIN
  v_profile_id := valuation.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF valuation.is_super_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT business_id, status INTO v_business_id, v_status
  FROM valuation.business_valuations
  WHERE id = p_valuation_id;

  IF v_business_id IS NULL OR v_status = 'archived' THEN
    RETURN FALSE;
  END IF;

  -- Check explicit edit permission
  RETURN EXISTS(
    SELECT 1 FROM valuation.valuation_assignments
    WHERE valuation_id = p_valuation_id
    AND assigned_profile_id = v_profile_id
    AND removed_at IS NULL
    AND can_edit = TRUE
  );
END;
$$;

-- valuation.can_publish_valuation(p_valuation_id UUID)
CREATE OR REPLACE FUNCTION valuation.can_publish_valuation(p_valuation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  v_profile_id := valuation.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF valuation.is_super_admin() THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS(
    SELECT 1 FROM valuation.valuation_assignments
    WHERE valuation_id = p_valuation_id
    AND assigned_profile_id = v_profile_id
    AND removed_at IS NULL
    AND can_publish = TRUE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION valuation.can_view_valuation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION valuation.can_edit_valuation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION valuation.can_publish_valuation(UUID) TO authenticated;

-- ============================================================================
-- 4. TABLE: business_valuations
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.business_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,

  -- Engagement metadata (Correction 5: multiple engagements)
  valuation_name TEXT NOT NULL DEFAULT 'Enterprise Value Analysis',
  valuation_type TEXT NOT NULL DEFAULT 'initial'
    CHECK (valuation_type IN ('initial', 'annual_update', 'pre_exit', 'transaction', 'strategic', 'other')),
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  engagement_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Valuation context (Phase 13.2)
  valuation_purpose TEXT,
  standard_of_value TEXT
    CHECK (standard_of_value IN ('fair_market_value', 'investment_value', 'strategic_value', 'fair_value', 'indicative_enterprise_value')),
  valuation_premise TEXT
    CHECK (valuation_premise IN ('going_concern', 'orderly_liquidation', 'asset_sale', 'stock_sale', 'controlling_interest', 'minority_interest')),
  valuation_date DATE,

  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'needs_review', 'advisor_approved', 'published', 'archived')),

  -- Advisor assignment
  lead_advisor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Client sharing
  client_sharing_status TEXT NOT NULL DEFAULT 'not_shared'
    CHECK (client_sharing_status IN ('not_shared', 'shared', 'revoked')),
  shared_version_id UUID,
  last_shared_version_id UUID,
  shared_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  shared_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Versioning
  latest_published_version_id UUID,
  current_draft_version_id UUID,

  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_valuations_business_id ON valuation.business_valuations(business_id);
CREATE INDEX IF NOT EXISTS idx_valuations_status ON valuation.business_valuations(status);
CREATE INDEX IF NOT EXISTS idx_valuations_lead_advisor ON valuation.business_valuations(lead_advisor_profile_id);
CREATE INDEX IF NOT EXISTS idx_valuations_engagement_date ON valuation.business_valuations(engagement_date DESC);

-- Correction 4: Only one actively shared valuation per business
CREATE UNIQUE INDEX IF NOT EXISTS idx_valuations_one_shared_per_business
  ON valuation.business_valuations(business_id)
  WHERE client_sharing_status = 'shared' AND status != 'archived';

-- Correction 5: Only one primary active draft per business
CREATE UNIQUE INDEX IF NOT EXISTS idx_valuations_one_primary_draft_per_business
  ON valuation.business_valuations(business_id)
  WHERE is_primary = TRUE AND status IN ('not_started', 'in_progress', 'needs_review', 'advisor_approved');

-- ============================================================================
-- 5. TABLE: valuation_versions
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  version_label TEXT,

  -- Snapshot data (Correction 11: engine/methodology versioning)
  internal_snapshot JSONB NOT NULL DEFAULT '{}',
  client_safe_snapshot JSONB NOT NULL DEFAULT '{}',

  -- Versioning metadata
  platform_version TEXT NOT NULL DEFAULT '1.0',
  valuation_engine_version TEXT NOT NULL DEFAULT '13.2.0',
  questionnaire_version TEXT NOT NULL DEFAULT '1.0.0',
  methodology_version TEXT NOT NULL DEFAULT '1.0.0',
  benchmark_data_version TEXT NOT NULL DEFAULT '1.0.0',
  publication_schema_version TEXT NOT NULL DEFAULT '1.0.0',

  -- Publication metadata
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Summary fields (for quick display)
  enterprise_value_low NUMERIC(19,4),
  enterprise_value_mid NUMERIC(19,4),
  enterprise_value_high NUMERIC(19,4),
  confidence_score NUMERIC(5,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(valuation_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_versions_valuation_id ON valuation.valuation_versions(valuation_id);
CREATE INDEX IF NOT EXISTS idx_versions_published_at ON valuation.valuation_versions(published_at DESC);

-- Self-referential FK for latest_published_version_id
ALTER TABLE valuation.business_valuations
  ADD CONSTRAINT fk_valuations_latest_version
  FOREIGN KEY (latest_published_version_id)
  REFERENCES valuation.valuation_versions(id) ON DELETE SET NULL;

ALTER TABLE valuation.business_valuations
  ADD CONSTRAINT fk_valuations_draft_version
  FOREIGN KEY (current_draft_version_id)
  REFERENCES valuation.valuation_versions(id) ON DELETE SET NULL;

-- Immutability trigger: published versions cannot be modified or deleted
CREATE OR REPLACE FUNCTION valuation.protect_published_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
BEGIN
  RAISE EXCEPTION 'Published valuation versions are immutable and cannot be modified or deleted';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_version_update ON valuation.valuation_versions;
CREATE TRIGGER trg_protect_version_update
  BEFORE UPDATE ON valuation.valuation_versions
  FOR EACH ROW EXECUTE FUNCTION valuation.protect_published_version();

DROP TRIGGER IF EXISTS trg_protect_version_delete ON valuation.valuation_versions;
CREATE TRIGGER trg_protect_version_delete
  BEFORE DELETE ON valuation.valuation_versions
  FOR EACH ROW EXECUTE FUNCTION valuation.protect_published_version();

GRANT EXECUTE ON FUNCTION valuation.protect_published_version() TO authenticated;

-- ============================================================================
-- 6. TABLE: valuation_assignments
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  assigned_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  assignment_role TEXT NOT NULL DEFAULT 'reviewer'
    CHECK (assignment_role IN ('lead', 'reviewer', 'financial_analyst', 'valuation_analyst', 'contributor', 'observer')),

  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_review BOOLEAN NOT NULL DEFAULT FALSE,
  can_publish BOOLEAN NOT NULL DEFAULT FALSE,

  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  removed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  removal_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_valuation_id ON valuation.valuation_assignments(valuation_id);
CREATE INDEX IF NOT EXISTS idx_assignments_profile_id ON valuation.valuation_assignments(assigned_profile_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active ON valuation.valuation_assignments(valuation_id, assigned_profile_id) WHERE removed_at IS NULL;

-- ============================================================================
-- 7. TABLE: valuation_sections
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL,
  section_name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sections_section_key ON valuation.valuation_sections(section_key);

-- ============================================================================
-- 8. TABLE: valuation_questions
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key TEXT NOT NULL,
  section_id UUID REFERENCES valuation.valuation_sections(id) ON DELETE SET NULL,

  question_text TEXT NOT NULL,
  explanation TEXT,

  answer_type TEXT NOT NULL
    CHECK (answer_type IN ('text', 'textarea', 'number', 'currency', 'percentage', 'date', 'single_select', 'multi_select', 'boolean', 'scale_1_5', 'scale_1_10', 'document_ref', 'advisor_only_text')),

  options JSONB DEFAULT '[]',
  required BOOLEAN NOT NULL DEFAULT FALSE,

  -- Conditional logic (JSON: { field: question_key, operator: 'equals'|'in'|'exists', value: ... })
  conditional_logic JSONB DEFAULT '{}',

  -- Valuation relevance
  valuation_relevance TEXT
    CHECK (valuation_relevance IN ('enterprise_value', 'multiple', 'profitability', 'risk', 'transferability', 'growth', 'owner_readiness', 'context')),
  multiple_relevance TEXT,
  profitability_relevance TEXT,

  -- Evidence
  suggested_evidence TEXT,

  -- Access control
  client_answerable BOOLEAN NOT NULL DEFAULT TRUE,
  advisor_only BOOLEAN NOT NULL DEFAULT FALSE,

  -- Confidence
  confidence_impact NUMERIC(5,2) DEFAULT 0,

  -- Display
  section TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,

  -- Versioning
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_question_key ON valuation.valuation_questions(question_key);
CREATE INDEX IF NOT EXISTS idx_questions_section ON valuation.valuation_questions(section_id);

-- ============================================================================
-- 9. TABLE: valuation_answers
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES valuation.valuation_questions(id) ON DELETE CASCADE,

  answer_value JSONB,
  answer_type TEXT NOT NULL
    CHECK (answer_type IN ('text', 'textarea', 'number', 'currency', 'percentage', 'date', 'single_select', 'multi_select', 'boolean', 'scale_1_5', 'scale_1_10', 'document_ref', 'advisor_only_text')),

  -- Source provenance (Phase 13.2)
  source_type TEXT
    CHECK (source_type IN ('advisor_entry', 'client_confirmation', 'prepopulated', 'document', 'extracted_field', 'assessment_answer', 'assessment_calculation', 'dashboard_metric', 'gap_analysis', 'external_benchmark')),
  source_id TEXT,
  source_date TIMESTAMPTZ,
  source_confidence NUMERIC(5,2),

  -- Verification
  is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  advisor_verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (advisor_verification_status IN ('pending', 'verified', 'overridden', 'rejected')),
  conflicting_sources JSONB DEFAULT '[]',

  answered_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(valuation_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_answers_valuation_id ON valuation.valuation_answers(valuation_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON valuation.valuation_answers(question_id);

-- ============================================================================
-- 10. TABLE: valuation_financials (Correction 7: expanded fields)
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  period_label TEXT NOT NULL,
  period_type TEXT NOT NULL
    CHECK (period_type IN ('historical', 'trailing_twelve_months', 'year_to_date', 'budget', 'forecast', 'projected')),
  period_start_date DATE,
  period_end_date DATE,
  fiscal_year INTEGER,

  -- Income statement (NUMERIC(19,4) for precision)
  revenue NUMERIC(19,4) DEFAULT 0,
  cogs NUMERIC(19,4) DEFAULT 0,
  gross_profit NUMERIC(19,4) DEFAULT 0,
  operating_expenses NUMERIC(19,4) DEFAULT 0,
  net_income NUMERIC(19,4) DEFAULT 0,

  -- Earnings (Correction 7: reported + normalized)
  reported_ebitda NUMERIC(19,4) DEFAULT 0,
  normalized_ebitda NUMERIC(19,4) DEFAULT 0,
  reported_sde NUMERIC(19,4) DEFAULT 0,
  normalized_sde NUMERIC(19,4) DEFAULT 0,
  owner_compensation NUMERIC(19,4) DEFAULT 0,

  -- D&A and financing
  depreciation NUMERIC(19,4) DEFAULT 0,
  amortization NUMERIC(19,4) DEFAULT 0,
  interest_expense NUMERIC(19,4) DEFAULT 0,
  taxes NUMERIC(19,4) DEFAULT 0,

  -- Balance sheet items
  cash NUMERIC(19,4) DEFAULT 0,
  funded_debt NUMERIC(19,4) DEFAULT 0,
  accounts_receivable NUMERIC(19,4) DEFAULT 0,
  accounts_payable NUMERIC(19,4) DEFAULT 0,
  inventory NUMERIC(19,4) DEFAULT 0,
  working_capital NUMERIC(19,4) DEFAULT 0,
  capital_expenditures NUMERIC(19,4) DEFAULT 0,

  -- Recast
  add_backs_total NUMERIC(19,4) DEFAULT 0,
  deductions_total NUMERIC(19,4) DEFAULT 0,
  recast_ebitda NUMERIC(19,4) DEFAULT 0,

  -- Source tracking (Correction 7)
  source_type TEXT
    CHECK (source_type IN ('document', 'extracted_field', 'advisor_entry', 'client_confirmation', 'assessment_calculation', 'dashboard_metric')),
  source_id TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'needs_review', 'rejected')),
  advisor_approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (advisor_approval_status IN ('pending', 'approved', 'rejected')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financials_valuation_id ON valuation.valuation_financials(valuation_id);
CREATE INDEX IF NOT EXISTS idx_financials_period ON valuation.valuation_financials(valuation_id, period_end_date DESC);

-- ============================================================================
-- 11. TABLE: valuation_adjustments (Correction 8: strengthened)
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  financial_id UUID REFERENCES valuation.valuation_financials(id) ON DELETE SET NULL,

  -- Period
  period_label TEXT,
  fiscal_year INTEGER,

  -- Adjustment classification
  adjustment_type TEXT NOT NULL
    CHECK (adjustment_type IN ('owner_compensation', 'owner_perks', 'rent_adjustment', 'one_time_expense', 'non_recurring', 'related_party', 'litigation', 'insurance', 'depreciation', 'amortization', 'interest', 'taxes', 'other')),
  adjustment_direction TEXT NOT NULL
    CHECK (adjustment_direction IN ('add_back', 'deduction')),

  -- Recurring classification
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,

  -- Amounts (stored as positive, direction applied separately)
  proposed_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(19,4) DEFAULT 0,

  -- Approval
  advisor_approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (advisor_approval_status IN ('pending', 'approved', 'rejected', 'needs_review')),

  -- Explanation and evidence
  explanation TEXT,
  evidence_source TEXT,
  evidence_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,

  -- Review
  reviewer_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_date TIMESTAMPTZ,
  override_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_adjustments_valuation_id ON valuation.valuation_adjustments(valuation_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_financial_id ON valuation.valuation_adjustments(financial_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_approval ON valuation.valuation_adjustments(valuation_id, advisor_approval_status);

-- ============================================================================
-- 12. TABLE: valuation_multiples
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_multiples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  method TEXT NOT NULL
    CHECK (method IN ('ebitda_multiple', 'sde_multiple', 'revenue_multiple', 'guideline_transaction', 'comparable_company', 'dcf', 'capitalization_of_earnings', 'adjusted_net_asset', 'asset_floor', 'liquidation')),

  earnings_basis TEXT
    CHECK (earnings_basis IN ('ebitda', 'sde', 'revenue', 'net_income', 'normalized_ebitda', 'normalized_sde', 'book_value')),

  base_multiple NUMERIC(10,4),
  multiple_adjustments JSONB DEFAULT '[]',
  final_multiple_low NUMERIC(10,4),
  final_multiple_mid NUMERIC(10,4),
  final_multiple_high NUMERIC(10,4),

  -- Method selection context
  is_primary_method BOOLEAN NOT NULL DEFAULT FALSE,
  is_secondary_method BOOLEAN NOT NULL DEFAULT FALSE,
  is_supporting_method BOOLEAN NOT NULL DEFAULT FALSE,
  is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
  selection_reason TEXT,
  exclusion_reason TEXT,

  -- Result
  enterprise_value_low NUMERIC(19,4),
  enterprise_value_mid NUMERIC(19,4),
  enterprise_value_high NUMERIC(19,4),

  confidence_score NUMERIC(5,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_multiples_valuation_id ON valuation.valuation_multiples(valuation_id);
CREATE INDEX IF NOT EXISTS idx_multiples_primary ON valuation.valuation_multiples(valuation_id) WHERE is_primary_method = TRUE;

-- ============================================================================
-- 13. TABLE: valuation_scenarios (Correction 6: expanded types)
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  scenario_type TEXT NOT NULL
    CHECK (scenario_type IN ('current', 'indicated', 'defensible', 'potential', 'conservative', 'base', 'aggressive', 'strategic')),

  scenario_name TEXT NOT NULL,
  description TEXT,

  -- Inputs
  normalized_earnings NUMERIC(19,4),
  applied_multiple NUMERIC(10,4),
  cash_adjustment NUMERIC(19,4) DEFAULT 0,
  debt_adjustment NUMERIC(19,4) DEFAULT 0,
  working_capital_adjustment NUMERIC(19,4) DEFAULT 0,

  -- Results
  enterprise_value NUMERIC(19,4),
  equity_value NUMERIC(19,4),

  -- Confidence
  confidence_score NUMERIC(5,2),
  assumptions JSONB DEFAULT '[]',

  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenarios_valuation_id ON valuation.valuation_scenarios(valuation_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_recommended ON valuation.valuation_scenarios(valuation_id) WHERE is_recommended = TRUE;

-- ============================================================================
-- 14. TABLE: valuation_evidence (Correction 9: allowlisted source_type)
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,

  -- Allowlisted source type (no arbitrary table access)
  source_type TEXT NOT NULL
    CHECK (source_type IN ('document', 'extracted_field', 'assessment_answer', 'assessment_calculation', 'dashboard_metric', 'gap_analysis', 'advisor_entry', 'client_confirmation', 'external_benchmark')),

  -- Metadata only — does NOT create arbitrary-table access
  source_record_id TEXT,
  source_label TEXT,
  source_date TIMESTAMPTZ,

  -- Evidence content
  evidence_summary TEXT NOT NULL,
  evidence_data JSONB DEFAULT '{}',

  -- Linkage
  linked_question_id UUID REFERENCES valuation.valuation_questions(id) ON DELETE SET NULL,
  linked_financial_id UUID REFERENCES valuation.valuation_financials(id) ON DELETE SET NULL,
  linked_adjustment_id UUID REFERENCES valuation.valuation_adjustments(id) ON DELETE SET NULL,
  linked_value_driver_id UUID REFERENCES valuation.valuation_value_drivers(id) ON DELETE SET NULL,

  -- Confidence
  confidence_score NUMERIC(5,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_valuation_id ON valuation.valuation_evidence(valuation_id);
CREATE INDEX IF NOT EXISTS idx_evidence_source_type ON valuation.valuation_evidence(source_type);

-- ============================================================================
-- 15. TABLE: valuation_audit_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  version_id UUID REFERENCES valuation.valuation_versions(id) ON DELETE SET NULL,

  action TEXT NOT NULL
    CHECK (action IN ('created', 'updated', 'status_changed', 'assigned', 'unassigned', 'published', 'shared', 'revoked', 'archived', 'restored', 'answer_saved', 'financial_saved', 'adjustment_saved', 'calculation_saved', 'value_driver_saved', 'reviewed')),
  action_details JSONB DEFAULT '{}',

  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_valuation_id ON valuation.valuation_audit_log(valuation_id);
CREATE INDEX IF NOT EXISTS idx_audit_acted_at ON valuation.valuation_audit_log(acted_at DESC);

-- ============================================================================
-- 16. NEW TABLE: valuation_calculations (Correction 10)
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  calculation_type TEXT NOT NULL
    CHECK (calculation_type IN ('capitalization_of_earnings', 'dcf', 'ebitda_multiple', 'sde_multiple', 'revenue_multiple', 'guideline_transaction', 'comparable_company', 'adjusted_net_asset', 'asset_floor', 'liquidation', 'blended', 'reconciliation')),
  methodology TEXT NOT NULL,

  earnings_basis TEXT
    CHECK (earnings_basis IN ('ebitda', 'sde', 'revenue', 'net_income', 'normalized_ebitda', 'normalized_sde', 'book_value')),

  -- Inputs
  normalized_earnings NUMERIC(19,4),
  base_multiple NUMERIC(10,4),
  multiple_adjustments JSONB DEFAULT '[]',

  -- Multiple results
  final_multiple_low NUMERIC(10,4),
  final_multiple_mid NUMERIC(10,4),
  final_multiple_high NUMERIC(10,4),

  -- Enterprise value
  enterprise_value_low NUMERIC(19,4),
  enterprise_value_mid NUMERIC(19,4),
  enterprise_value_high NUMERIC(19,4),

  -- Equity value
  cash NUMERIC(19,4) DEFAULT 0,
  debt NUMERIC(19,4) DEFAULT 0,
  equity_value_low NUMERIC(19,4),
  equity_value_mid NUMERIC(19,4),
  equity_value_high NUMERIC(19,4),

  -- Confidence and versioning
  confidence_score NUMERIC(5,2),
  calculation_engine_version TEXT NOT NULL DEFAULT '13.2.0',
  methodology_version TEXT NOT NULL DEFAULT '1.0.0',

  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Approval
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calculations_valuation_id ON valuation.valuation_calculations(valuation_id);
CREATE INDEX IF NOT EXISTS idx_calculations_approved ON valuation.valuation_calculations(valuation_id) WHERE is_approved = TRUE;

-- ============================================================================
-- 17. NEW TABLE: valuation_value_drivers (Correction 10)
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_value_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,

  -- Driver identification
  driver_key TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('profitability', 'valuation_multiple', 'family_office', 'exit_planning', 'human_capital', 'customer_capital', 'structural_capital', 'social_capital', 'financial_performance', 'growth_potential', 'risk', 'transferability', 'owner_readiness', 'business_readiness', 'market_readiness')),

  -- Current vs target state
  current_state TEXT,
  target_state TEXT,

  -- Impact type
  impact_type TEXT NOT NULL
    CHECK (impact_type IN ('value_enhancer', 'value_detractor', 'risk_factor', 'opportunity', 'neutral')),

  -- Estimated impact
  estimated_ebitda_impact NUMERIC(19,4),
  estimated_multiple_impact NUMERIC(10,4),
  estimated_enterprise_value_impact_low NUMERIC(19,4),
  estimated_enterprise_value_impact_high NUMERIC(19,4),

  -- Confidence and priority
  confidence_score NUMERIC(5,2),
  priority TEXT CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  difficulty TEXT CHECK (difficulty IN ('high', 'medium', 'low')),
  estimated_timeline_months INTEGER,

  -- Evidence
  evidence_summary TEXT,

  -- Advisor status
  advisor_status TEXT NOT NULL DEFAULT 'identified'
    CHECK (advisor_status IN ('identified', 'under_review', 'confirmed', 'rejected', 'actionable')),

  -- Client visibility
  client_visible BOOLEAN NOT NULL DEFAULT FALSE,

  -- Roadmap linkage
  roadmap_item_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_value_drivers_valuation_id ON valuation.valuation_value_drivers(valuation_id);
CREATE INDEX IF NOT EXISTS idx_value_drivers_business_id ON valuation.valuation_value_drivers(business_id);
CREATE INDEX IF NOT EXISTS idx_value_drivers_category ON valuation.valuation_value_drivers(valuation_id, category);

-- ============================================================================
-- 18. ENABLE RLS ON ALL TABLES
-- ============================================================================
ALTER TABLE valuation.business_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_multiples ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_value_drivers ENABLE ROW LEVEL SECURITY;

-- Force RLS (even for table owners)
ALTER TABLE valuation.business_valuations FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_sections FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_answers FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_financials FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_multiples FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_scenarios FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_calculations FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_value_drivers FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 19. RLS POLICIES — business_valuations
-- ============================================================================
CREATE POLICY valuations_select ON valuation.business_valuations
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(id));

CREATE POLICY valuations_insert ON valuation.business_valuations
  FOR INSERT TO authenticated
  WITH CHECK (valuation.has_business_access(business_id) OR valuation.is_super_admin());

CREATE POLICY valuations_update ON valuation.business_valuations
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(id) OR valuation.is_super_admin());

CREATE POLICY valuations_delete ON valuation.business_valuations
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 20. RLS POLICIES — valuation_versions
-- ============================================================================
CREATE POLICY versions_select ON valuation.valuation_versions
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY versions_insert ON valuation.valuation_versions
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_publish_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY versions_delete ON valuation.valuation_versions
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 21. RLS POLICIES — valuation_assignments
-- ============================================================================
CREATE POLICY assignments_select ON valuation.valuation_assignments
  FOR SELECT TO authenticated
  USING (
    valuation.is_super_admin()
    OR assigned_profile_id = valuation.current_profile_id()
    OR valuation.can_view_valuation(valuation_id)
  );

CREATE POLICY assignments_insert ON valuation.valuation_assignments
  FOR INSERT TO authenticated
  WITH CHECK (valuation.is_super_admin() OR valuation.can_publish_valuation(valuation_id));

CREATE POLICY assignments_update ON valuation.valuation_assignments
  FOR UPDATE TO authenticated
  USING (valuation.is_super_admin() OR valuation.can_publish_valuation(valuation_id));

CREATE POLICY assignments_delete ON valuation.valuation_assignments
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 22. RLS POLICIES — valuation_sections (read-only, all authenticated)
-- ============================================================================
CREATE POLICY sections_select ON valuation.valuation_sections
  FOR SELECT TO authenticated
  USING (is_active = TRUE);

-- ============================================================================
-- 23. RLS POLICIES — valuation_questions (read-only, all authenticated)
-- ============================================================================
CREATE POLICY questions_select ON valuation.valuation_questions
  FOR SELECT TO authenticated
  USING (is_active = TRUE);

-- ============================================================================
-- 24. RLS POLICIES — valuation_answers
-- ============================================================================
CREATE POLICY answers_select ON valuation.valuation_answers
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY answers_insert ON valuation.valuation_answers
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY answers_update ON valuation.valuation_answers
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY answers_delete ON valuation.valuation_answers
  FOR DELETE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

-- ============================================================================
-- 25. RLS POLICIES — valuation_financials
-- ============================================================================
CREATE POLICY financials_select ON valuation.valuation_financials
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY financials_insert ON valuation.valuation_financials
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY financials_update ON valuation.valuation_financials
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY financials_delete ON valuation.valuation_financials
  FOR DELETE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

-- ============================================================================
-- 26. RLS POLICIES — valuation_adjustments
-- ============================================================================
CREATE POLICY adjustments_select ON valuation.valuation_adjustments
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY adjustments_insert ON valuation.valuation_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY adjustments_update ON valuation.valuation_adjustments
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY adjustments_delete ON valuation.valuation_adjustments
  FOR DELETE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

-- ============================================================================
-- 27. RLS POLICIES — valuation_multiples
-- ============================================================================
CREATE POLICY multiples_select ON valuation.valuation_multiples
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY multiples_insert ON valuation.valuation_multiples
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY multiples_update ON valuation.valuation_multiples
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY multiples_delete ON valuation.valuation_multiples
  FOR DELETE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

-- ============================================================================
-- 28. RLS POLICIES — valuation_scenarios
-- ============================================================================
CREATE POLICY scenarios_select ON valuation.valuation_scenarios
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY scenarios_insert ON valuation.valuation_scenarios
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY scenarios_update ON valuation.valuation_scenarios
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY scenarios_delete ON valuation.valuation_scenarios
  FOR DELETE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

-- ============================================================================
-- 29. RLS POLICIES — valuation_evidence
-- ============================================================================
CREATE POLICY evidence_select ON valuation.valuation_evidence
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY evidence_insert ON valuation.valuation_evidence
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY evidence_update ON valuation.valuation_evidence
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY evidence_delete ON valuation.valuation_evidence
  FOR DELETE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

-- ============================================================================
-- 30. RLS POLICIES — valuation_audit_log
-- ============================================================================
CREATE POLICY audit_select ON valuation.valuation_audit_log
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY audit_insert ON valuation.valuation_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (valuation.current_profile_id() IS NOT NULL);

-- ============================================================================
-- 31. RLS POLICIES — valuation_calculations
-- ============================================================================
CREATE POLICY calculations_select ON valuation.valuation_calculations
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY calculations_insert ON valuation.valuation_calculations
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY calculations_update ON valuation.valuation_calculations
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY calculations_delete ON valuation.valuation_calculations
  FOR DELETE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

-- ============================================================================
-- 32. RLS POLICIES — valuation_value_drivers
-- ============================================================================
CREATE POLICY value_drivers_select ON valuation.valuation_value_drivers
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY value_drivers_insert ON valuation.valuation_value_drivers
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY value_drivers_update ON valuation.valuation_value_drivers
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY value_drivers_delete ON valuation.valuation_value_drivers
  FOR DELETE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

-- ============================================================================
-- 33. GRANT TABLE PERMISSIONS
-- ============================================================================
-- service_role: used by backend functions with service role key (bypasses RLS)
-- authenticated: used by client-side Supabase queries (RLS-protected)
GRANT USAGE ON SCHEMA valuation TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA valuation TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA valuation TO service_role;

GRANT USAGE ON SCHEMA valuation TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA valuation TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA valuation TO authenticated;

-- ============================================================================
-- 34. SHARED CLIENT SUMMARY RPC (Correction 4: deterministic query)
-- ============================================================================
CREATE OR REPLACE FUNCTION valuation.getSharedClientSummary(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_valuation RECORD;
  v_version RECORD;
  v_result JSONB;
BEGIN
  -- Deterministic: find the ONE actively shared, non-archived valuation
  -- with a non-null shared_version_id for this business
  SELECT * INTO v_valuation
  FROM valuation.business_valuations
  WHERE business_id = p_business_id
    AND client_sharing_status = 'shared'
    AND status != 'archived'
    AND shared_version_id IS NOT NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Get the shared version's client-safe snapshot
  SELECT * INTO v_version
  FROM valuation.valuation_versions
  WHERE id = v_valuation.shared_version_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_result := jsonb_build_object(
    'valuation_id', v_valuation.id,
    'valuation_name', v_valuation.valuation_name,
    'valuation_type', v_valuation.valuation_type,
    'valuation_date', v_valuation.valuation_date,
    'standard_of_value', v_valuation.standard_of_value,
    'valuation_premise', v_valuation.valuation_premise,
    'shared_at', v_valuation.shared_at,
    'version_number', v_version.version_number,
    'version_label', v_version.version_label,
    'published_at', v_version.published_at,
    'client_safe_snapshot', v_version.client_safe_snapshot,
    'enterprise_value_low', v_version.enterprise_value_low,
    'enterprise_value_mid', v_version.enterprise_value_mid,
    'enterprise_value_high', v_version.enterprise_value_high,
    'confidence_score', v_version.confidence_score,
    'platform_version', v_version.platform_version,
    'valuation_engine_version', v_version.valuation_engine_version,
    'questionnaire_version', v_version.questionnaire_version,
    'methodology_version', v_version.methodology_version,
    'benchmark_data_version', v_version.benchmark_data_version,
    'publication_schema_version', v_version.publication_schema_version
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION valuation.getSharedClientSummary(UUID) TO authenticated;

-- ============================================================================
-- 35. PUBLICATION RPC (Correction 3: concurrency-safe)
-- ============================================================================
CREATE OR REPLACE FUNCTION valuation.publishValuation(
  p_valuation_id UUID,
  p_actor_profile_id UUID,
  p_internal_snapshot JSONB,
  p_client_safe_snapshot JSONB,
  p_version_label TEXT DEFAULT NULL,
  p_enterprise_value_low NUMERIC DEFAULT NULL,
  p_enterprise_value_mid NUMERIC DEFAULT NULL,
  p_enterprise_value_high NUMERIC DEFAULT NULL,
  p_confidence_score NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_valuation RECORD;
  v_next_version INTEGER;
  v_version_id UUID;
BEGIN
  -- Step 1: Lock the parent valuation row (Correction 3)
  SELECT * INTO v_valuation
  FROM valuation.business_valuations
  WHERE id = p_valuation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Valuation not found';
  END IF;

  -- Step 2: Confirm publishable
  IF v_valuation.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot publish an archived valuation';
  END IF;

  -- Step 3: Calculate next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM valuation.valuation_versions
  WHERE valuation_id = p_valuation_id;

  -- Step 4: Insert the new version
  INSERT INTO valuation.valuation_versions (
    valuation_id, version_number, version_label,
    internal_snapshot, client_safe_snapshot,
    enterprise_value_low, enterprise_value_mid, enterprise_value_high,
    confidence_score,
    published_by_profile_id
  ) VALUES (
    p_valuation_id, v_next_version, p_version_label,
    p_internal_snapshot, p_client_safe_snapshot,
    p_enterprise_value_low, p_enterprise_value_mid, p_enterprise_value_high,
    p_confidence_score,
    p_actor_profile_id
  )
  RETURNING id INTO v_version_id;

  -- Step 5: Update latest_published_version_id
  UPDATE valuation.business_valuations
  SET latest_published_version_id = v_version_id,
    status = 'published',
    updated_at = NOW(),
    updated_by_profile_id = p_actor_profile_id
  WHERE id = p_valuation_id;

  -- Step 6: Append audit event
  INSERT INTO valuation.valuation_audit_log (valuation_id, version_id, action, action_details, actor_profile_id)
  VALUES (p_valuation_id, v_version_id, 'published',
    jsonb_build_object('version_number', v_next_version, 'version_label', p_version_label),
    p_actor_profile_id);

  -- Step 7: Commit (automatic at end of function)
  RETURN v_version_id;
END;
$$;

GRANT EXECUTE ON FUNCTION valuation.publishValuation TO authenticated;

-- ============================================================================
-- 36. UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION valuation.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION valuation.update_updated_at() TO authenticated;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_valuations_updated_at BEFORE UPDATE ON valuation.business_valuations
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_versions_updated_at BEFORE UPDATE ON valuation.valuation_versions
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON valuation.valuation_assignments
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_questions_updated_at BEFORE UPDATE ON valuation.valuation_questions
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_answers_updated_at BEFORE UPDATE ON valuation.valuation_answers
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_financials_updated_at BEFORE UPDATE ON valuation.valuation_financials
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_adjustments_updated_at BEFORE UPDATE ON valuation.valuation_adjustments
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_multiples_updated_at BEFORE UPDATE ON valuation.valuation_multiples
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_scenarios_updated_at BEFORE UPDATE ON valuation.valuation_scenarios
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_calculations_updated_at BEFORE UPDATE ON valuation.valuation_calculations
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_value_drivers_updated_at BEFORE UPDATE ON valuation.valuation_value_drivers
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- VALIDATION QUERIES (run after execution):
--
-- 1. Verify schema exists:
--    SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'valuation';
--
-- 2. Verify all tables:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'valuation' ORDER BY table_name;
--    -- Expected: 14 tables
--
-- 3. Verify helper functions:
--    SELECT routine_name FROM information_schema.routines
--    WHERE routine_schema = 'valuation' ORDER BY routine_name;
--    -- Expected: current_profile_id, is_super_admin, is_advisor_or_admin,
--    -- has_business_access, can_view_valuation, can_edit_valuation,
--    -- can_publish_valuation, protect_published_version, update_updated_at,
--    -- getSharedClientSummary, publishValuation
--
-- 4. Verify RLS enabled:
--    SELECT tablename, rowsecurity, forcerowsecurity
--    FROM pg_tables WHERE schemaname = 'valuation';
--    -- Expected: all rows true, true
--
-- 5. Verify policies:
--    SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE schemaname = 'valuation' ORDER BY tablename, policyname;
--
-- 6. Verify partial unique indexes:
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE schemaname = 'valuation' AND indexname LIKE 'idx_valuations_one%';
--
-- 7. Test identity mapping:
--    SELECT valuation.current_profile_id();
--    -- Should return the profiles.id for the authenticated user
-- ============================================================================