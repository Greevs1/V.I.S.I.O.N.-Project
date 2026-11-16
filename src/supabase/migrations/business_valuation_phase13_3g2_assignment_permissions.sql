-- ============================================================================
-- Phase 13.3G.2 — Valuation Assignment Lifecycle Permissions
-- ============================================================================
-- This migration is ADDITIVE, IDEMPOTENT, NON-DESTRUCTIVE, SCHEMA-QUALIFIED,
-- and RLS-SAFE. It extends the existing valuation_assignments table with
-- four new permission flags:
--
--   can_create_valuation      — may start a new valuation for this business
--   can_restore_valuation     — may restore an archived valuation
--   can_archive_valuation     — may archive an active valuation
--   can_manage_assignments    — may assign/remove advisors and change permissions
--
-- Existing permissions (can_view, can_edit, can_review, can_publish) are
-- preserved unchanged. Super admins retain implicit full access via the
-- app_role check in the backend (no database change needed).
--
-- BACKFILL:
--   Existing active lead advisors  → all four new flags = TRUE
--   Existing active non-lead       → all four new flags = FALSE (default)
--   Removed assignments            → all four new flags = FALSE (default)
--
-- This migration does NOT grant broad new permissions to every existing
-- advisor. Only lead advisors gain lifecycle + management access.
--
-- MANUALLY EXECUTE ONLY. Do not run programmatically.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD NEW PERMISSION COLUMNS
-- ============================================================================
ALTER TABLE valuation.valuation_assignments
  ADD COLUMN IF NOT EXISTS can_create_valuation BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE valuation.valuation_assignments
  ADD COLUMN IF NOT EXISTS can_restore_valuation BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE valuation.valuation_assignments
  ADD COLUMN IF NOT EXISTS can_archive_valuation BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE valuation.valuation_assignments
  ADD COLUMN IF NOT EXISTS can_manage_assignments BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- 2. BACKFILL EXISTING LEAD ADVISORS
-- ============================================================================
-- Active lead advisors gain lifecycle + management permissions.
-- Non-lead and removed advisors keep defaults (all FALSE).
UPDATE valuation.valuation_assignments
SET can_create_valuation = TRUE,
    can_restore_valuation = TRUE,
    can_archive_valuation = TRUE,
    can_manage_assignments = TRUE,
    updated_at = NOW()
WHERE assignment_role = 'lead'
  AND removed_at IS NULL;

-- ============================================================================
-- 3. RLS HELPER FUNCTIONS (for direct-query safety)
-- ============================================================================
-- The backend uses service role (bypasses RLS) and enforces permissions in
-- application code. These functions exist for any future direct-query paths
-- and for documentation of the permission model.

-- valuation.can_create_valuation(p_business_id UUID)
-- Returns TRUE if the current profile may create a new valuation for the
-- given business. Super admins always pass. Advisors with business access
-- may create the FIRST valuation. Once a valuation exists, an active
-- assignment with can_create_valuation = TRUE is required.
CREATE OR REPLACE FUNCTION valuation.can_create_valuation(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_profile_id UUID;
  v_existing_val_id UUID;
BEGIN
  v_profile_id := valuation.current_profile_id();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;
  IF valuation.is_super_admin() THEN RETURN TRUE; END IF;

  -- Must have business access
  IF NOT valuation.has_business_access(p_business_id) THEN RETURN FALSE; END IF;

  -- Check if any non-archived valuation exists for this business
  SELECT id INTO v_existing_val_id
  FROM valuation.business_valuations
  WHERE business_id = p_business_id
    AND status != 'archived'
  LIMIT 1;

  -- No existing valuation — any advisor with business access may create
  IF v_existing_val_id IS NULL THEN RETURN TRUE; END IF;

  -- Existing valuation — require can_create_valuation on active assignment
  RETURN EXISTS(
    SELECT 1 FROM valuation.valuation_assignments
    WHERE valuation_id = v_existing_val_id
      AND assigned_profile_id = v_profile_id
      AND removed_at IS NULL
      AND can_create_valuation = TRUE
  );
END;
$$;

-- valuation.can_restore_valuation(p_valuation_id UUID)
CREATE OR REPLACE FUNCTION valuation.can_restore_valuation(p_valuation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  v_profile_id := valuation.current_profile_id();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;
  IF valuation.is_super_admin() THEN RETURN TRUE; END IF;

  RETURN EXISTS(
    SELECT 1 FROM valuation.valuation_assignments
    WHERE valuation_id = p_valuation_id
      AND assigned_profile_id = v_profile_id
      AND removed_at IS NULL
      AND can_restore_valuation = TRUE
  );
END;
$$;

-- valuation.can_archive_valuation(p_valuation_id UUID)
CREATE OR REPLACE FUNCTION valuation.can_archive_valuation(p_valuation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  v_profile_id := valuation.current_profile_id();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;
  IF valuation.is_super_admin() THEN RETURN TRUE; END IF;

  RETURN EXISTS(
    SELECT 1 FROM valuation.valuation_assignments
    WHERE valuation_id = p_valuation_id
      AND assigned_profile_id = v_profile_id
      AND removed_at IS NULL
      AND can_archive_valuation = TRUE
  );
END;
$$;

-- valuation.can_manage_assignments(p_valuation_id UUID)
CREATE OR REPLACE FUNCTION valuation.can_manage_assignments(p_valuation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = valuation, public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  v_profile_id := valuation.current_profile_id();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;
  IF valuation.is_super_admin() THEN RETURN TRUE; END IF;

  RETURN EXISTS(
    SELECT 1 FROM valuation.valuation_assignments
    WHERE valuation_id = p_valuation_id
      AND assigned_profile_id = v_profile_id
      AND removed_at IS NULL
      AND can_manage_assignments = TRUE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION valuation.can_create_valuation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION valuation.can_restore_valuation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION valuation.can_archive_valuation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION valuation.can_manage_assignments(UUID) TO authenticated;

-- ============================================================================
-- 4. INDEX for permission lookups (optional, minor perf)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_assignments_create_perm
  ON valuation.valuation_assignments(valuation_id, assigned_profile_id)
  WHERE removed_at IS NULL AND can_create_valuation = TRUE;

CREATE INDEX IF NOT EXISTS idx_assignments_manage_perm
  ON valuation.valuation_assignments(valuation_id, assigned_profile_id)
  WHERE removed_at IS NULL AND can_manage_assignments = TRUE;

COMMIT;