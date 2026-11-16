-- ============================================================================
-- Phase D — Decision Intelligence Foundation (SECURITY-CORRECTED)
-- ============================================================================
-- Single additive Supabase table for the Decision domain.
-- JSONB for complex nested structures (options, assumptions, evidence,
-- risks, unknowns, outcomes) — avoids over-normalization.
--
-- SECURITY CORRECTIONS APPLIED:
--   1. Identity: auth.uid() → profiles.auth_user_id → profiles.id
--      (Reuses certified valuation.current_profile_id() helper — NEVER
--       compares auth.uid() directly to profiles.id)
--   2. Advisor write access requires business authorization via
--      valuation.has_business_access() — prevents cross-business writes
--   3. Owner SELECT filtered by client_visible/visibility — owners cannot
--      see advisor_internal decisions
--   4. CHECK constraints match types.ts exactly (14 types, 8 statuses, etc.)
--   5. FKs: business_id → business_entities, profile FKs → profiles
--   6. Supersession self-referential FKs ON DELETE SET NULL
--   7. service_role: full DML; authenticated: SELECT only (backend-mediated
--      writes via decisionIntelligenceService using service role key)
--   8. FORCE ROW LEVEL SECURITY
--   9. Idempotent (all IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE)
--  10. NOTIFY pgrst, 'reload schema' at end
--
-- IDENTITY MAPPING (CERTIFIED — from business_valuation.sql):
--   profiles.id           = profile UUID (PK)
--   profiles.auth_user_id = Supabase auth user UUID (maps to auth.uid())
--   profiles.base44_user_id = Base44 user ID
--   profiles.app_role     = role column (super_admin, admin, expert_advisor,
--                          advisor, owner, team_member, user)
--
-- CERTIFIED HELPERS REUSED (from valuation schema, already in production):
--   valuation.current_profile_id()   — auth.uid() → profiles.id
--   valuation.is_super_admin()        — app_role = 'super_admin'
--   valuation.is_advisor_or_admin()   — app_role IN ('advisor','admin','super_admin')
--   valuation.has_business_access(id) — ownership OR assigned_advisor_id
--
-- ADVISOR AUTHORIZATION (CERTIFIED):
--   business_owners.profile_id = resolved_profile_id
--   business_entities.assigned_advisor_id = resolved_profile_id
--   (NOT advisor_assignments — that table is not in any migration and
--    may not exist in production)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.business_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id text UNIQUE NOT NULL,
  business_id uuid NOT NULL,

  title text NOT NULL,
  decision_type text NOT NULL DEFAULT 'strategic',
  decision_status text NOT NULL DEFAULT 'draft',

  question text,
  context_summary text,

  created_by_profile_id uuid,
  decision_owner_profile_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  target_decision_date date,
  decided_at timestamptz,

  importance text NOT NULL DEFAULT 'strategic',
  risk_level text NOT NULL DEFAULT 'medium',

  meeting_context_id text,

  -- Structured arrays as JSONB
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  unknowns jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Recommendation (advisory only)
  recommendation jsonb,
  recommended_option_id text,

  -- Final human decision
  selected_option_id text,
  decision_reason text,
  decided_by_profile_id uuid,

  -- Outcomes
  expected_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  actual_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome_status text,
  outcome_review_date date,
  outcome_reviewed_at timestamptz,
  outcome_notes text,

  -- Provenance / Immutability (Article XII)
  source_contract_version text,
  source_context_snapshot jsonb,

  -- Visibility
  visibility text NOT NULL DEFAULT 'advisor_internal',
  client_visible boolean NOT NULL DEFAULT false,

  -- Supersession
  supersedes_decision_id text,
  superseded_by_decision_id text,

  -- Execution routing
  execution_routes jsonb NOT NULL DEFAULT '[]'::jsonb,

  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. CHECK CONSTRAINTS (match types.ts exactly)
-- ============================================================================

-- decision_type: 14 values (DecisionType in types.ts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_decisions_decision_type_check'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions ADD CONSTRAINT business_decisions_decision_type_check
      CHECK (decision_type IN (
        'strategic', 'financial', 'operating', 'talent', 'capital_allocation',
        'acquisition', 'exit', 'pricing', 'growth', 'risk', 'ownership',
        'tax', 'technology', 'other'
      ));
  END IF;
END $$;

-- decision_status: 8 values (DecisionStatus in types.ts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_decisions_decision_status_check'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions ADD CONSTRAINT business_decisions_decision_status_check
      CHECK (decision_status IN (
        'draft', 'analyzing', 'needs_information', 'ready_for_decision',
        'decided', 'deferred', 'cancelled', 'superseded'
      ));
  END IF;
END $$;

-- importance: 4 values (DecisionImportance in types.ts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_decisions_importance_check'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions ADD CONSTRAINT business_decisions_importance_check
      CHECK (importance IN ('critical', 'strategic', 'significant', 'routine'));
  END IF;
END $$;

-- risk_level: 4 values (DecisionRiskLevel in types.ts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_decisions_risk_level_check'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions ADD CONSTRAINT business_decisions_risk_level_check
      CHECK (risk_level IN ('low', 'medium', 'high', 'critical'));
  END IF;
END $$;

-- visibility: 2 values (DecisionVisibility in types.ts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_decisions_visibility_check'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions ADD CONSTRAINT business_decisions_visibility_check
      CHECK (visibility IN ('advisor_internal', 'client_safe'));
  END IF;
END $$;

-- outcome_status: 6 values (OutcomeStatus in types.ts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_decisions_outcome_status_check'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions ADD CONSTRAINT business_decisions_outcome_status_check
      CHECK (outcome_status IS NULL OR outcome_status IN (
        'pending', 'ongoing', 'succeeded', 'partially_succeeded',
        'failed', 'inconclusive'
      ));
  END IF;
END $$;

-- ============================================================================
-- 3. FOREIGN KEYS
-- ============================================================================

-- business_id → business_entities(id) ON DELETE CASCADE
-- (If a business is deleted, its decisions are deleted — consistent with
--  the valuation migration pattern.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_business_decisions_business_id'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions
      ADD CONSTRAINT fk_business_decisions_business_id
      FOREIGN KEY (business_id) REFERENCES public.business_entities(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- created_by_profile_id → profiles(id) ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_business_decisions_created_by_profile'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions
      ADD CONSTRAINT fk_business_decisions_created_by_profile
      FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- decision_owner_profile_id → profiles(id) ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_business_decisions_owner_profile'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions
      ADD CONSTRAINT fk_business_decisions_owner_profile
      FOREIGN KEY (decision_owner_profile_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- decided_by_profile_id → profiles(id) ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_business_decisions_decided_by_profile'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions
      ADD CONSTRAINT fk_business_decisions_decided_by_profile
      FOREIGN KEY (decided_by_profile_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Supersession self-referential FKs (reference decision_id text, not UUID PK)
-- ON DELETE SET NULL: if a referenced decision is deleted, the link is cleared
-- but the referencing decision is preserved. Application-level validation
-- remains authoritative for supersession workflow ordering.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_business_decisions_supersedes'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions
      ADD CONSTRAINT fk_business_decisions_supersedes
      FOREIGN KEY (supersedes_decision_id) REFERENCES public.business_decisions(decision_id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_business_decisions_superseded_by'
      AND conrelid = 'business_decisions'::regclass
  ) THEN
    ALTER TABLE business_decisions
      ADD CONSTRAINT fk_business_decisions_superseded_by
      FOREIGN KEY (superseded_by_decision_id) REFERENCES public.business_decisions(decision_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 4. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_business_decisions_business_id
  ON business_decisions(business_id);

CREATE INDEX IF NOT EXISTS idx_business_decisions_business_created
  ON business_decisions(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_decisions_business_status
  ON business_decisions(business_id, decision_status);

CREATE INDEX IF NOT EXISTS idx_business_decisions_business_type
  ON business_decisions(business_id, decision_type);

CREATE INDEX IF NOT EXISTS idx_business_decisions_business_status_created
  ON business_decisions(business_id, decision_status, created_at DESC);

-- Ledger query: decided/superseded, ordered by decided_at
CREATE INDEX IF NOT EXISTS idx_business_decisions_business_decided
  ON business_decisions(business_id, decided_at DESC)
  WHERE decision_status IN ('decided', 'superseded');

-- ============================================================================
-- 5. UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_business_decisions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_decisions_updated_at ON business_decisions;
CREATE TRIGGER trg_business_decisions_updated_at
  BEFORE UPDATE ON business_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_business_decisions_updated_at();

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE business_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_decisions FORCE ROW LEVEL SECURITY;

-- ── SELECT: visibility-aware read access ─────────────────────────────────
-- Super admin: all decisions
-- Advisor/admin with business access: all decisions for that business
--   (including advisor_internal — they are the trusted party)
-- Owner with business ownership: only client_visible OR client_safe decisions
--   (never advisor_internal: internal recommendations, advisor concerns,
--    negotiation positioning, private challenge output)
DROP POLICY IF EXISTS business_decisions_select ON business_decisions;
CREATE POLICY business_decisions_select ON business_decisions
  FOR SELECT TO authenticated
  USING (
    valuation.is_super_admin()
    OR (
      valuation.has_business_access(business_id)
      AND (
        valuation.is_advisor_or_admin()
        OR client_visible = TRUE
        OR visibility = 'client_safe'
      )
    )
  );

-- ── INSERT: backend-mediated (defense in depth) ────────────────────────────
-- Authenticated users do NOT receive INSERT grant (see GRANTS below).
-- This policy exists as defense in depth: if DML is ever granted, only
-- advisors/admins with explicit business authorization may insert.
DROP POLICY IF EXISTS business_decisions_insert ON business_decisions;
CREATE POLICY business_decisions_insert ON business_decisions
  FOR INSERT TO authenticated
  WITH CHECK (
    valuation.is_super_admin()
    OR (
      valuation.is_advisor_or_admin()
      AND valuation.has_business_access(business_id)
    )
  );

-- ── UPDATE: backend-mediated (defense in depth) ────────────────────────────
-- Same business-authorization requirement. An advisor assigned to Business A
-- CANNOT update decisions for Business B.
DROP POLICY IF EXISTS business_decisions_update ON business_decisions;
CREATE POLICY business_decisions_update ON business_decisions
  FOR UPDATE TO authenticated
  USING (
    valuation.is_super_admin()
    OR (
      valuation.is_advisor_or_admin()
      AND valuation.has_business_access(business_id)
    )
  )
  WITH CHECK (
    valuation.is_super_admin()
    OR (
      valuation.is_advisor_or_admin()
      AND valuation.has_business_access(business_id)
    )
  );

-- ── DELETE: super_admin only ──────────────────────────────────────────────
-- Decisions are historical records. Only super_admins may delete.
DROP POLICY IF EXISTS business_decisions_delete ON business_decisions;
CREATE POLICY business_decisions_delete ON business_decisions
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 7. GRANTS
-- ============================================================================
-- service_role: used by decisionIntelligenceService backend function with
--   the service role key (bypasses RLS). Full DML required.
-- authenticated: direct browser SELECT only (RLS-protected with visibility
--   filtering). Writes are backend-mediated — no direct DML grant.
REVOKE ALL ON public.business_decisions FROM authenticated;
GRANT SELECT ON public.business_decisions TO authenticated;

GRANT ALL ON public.business_decisions TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============================================================================
-- 8. COMMENT
-- ============================================================================
COMMENT ON TABLE public.business_decisions IS 'Phase D — Decision Intelligence Foundation. Governed human decision support layer. AI proposes, humans decide. Identity: auth.uid() → profiles.auth_user_id → profiles.id (via valuation.current_profile_id). Writes are backend-mediated via decisionIntelligenceService.';

-- ============================================================================
-- 9. RELOAD POSTGREST SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- VALIDATION QUERIES (run after execution):
--
-- 1. Verify table exists:
--    SELECT * FROM public.business_decisions LIMIT 0;
--
-- 2. Verify CHECK constraints:
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint WHERE conrelid = 'business_decisions'::regclass
--    AND contype = 'c';
--
-- 3. Verify FKs:
--    SELECT conname, conrelid::regclass, confrelid::regclass
--    FROM pg_constraint WHERE conrelid = 'business_decisions'::regclass
--    AND contype = 'f';
--
-- 4. Verify RLS enabled + forced:
--    SELECT tablename, rowsecurity, forcerowsecurity
--    FROM pg_tables WHERE tablename = 'business_decisions';
--    -- Expected: business_decisions | t | t
--
-- 5. Verify policies:
--    SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'business_decisions' ORDER BY policyname;
--    -- Expected: business_decisions_delete, _insert, _select, _update
--
-- 6. Verify grants:
--    SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'business_decisions';
--    -- Expected: service_role has ALL; authenticated has SELECT only
--
-- 7. Test identity resolution:
--    SELECT valuation.current_profile_id();
--    -- Should return profiles.id for the authenticated user
--
-- 8. Test advisor cross-business isolation:
--    -- As an advisor assigned to Business A, attempt:
--    -- INSERT INTO business_decisions (business_id, decision_id, title, ...)
--    -- VALUES ('<business_B_id>', 'test-isolation', 'test', ...)
--    -- Expected: REJECTED (policy violation — no access to Business B)
-- ============================================================================