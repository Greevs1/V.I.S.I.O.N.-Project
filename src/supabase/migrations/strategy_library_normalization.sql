-- ============================================================
-- PHASE 12B.2: Strategy Library Normalization Migration
-- V.I.S.I.O.N. Platform™ — Additive only, no existing columns modified
--
-- Live-verified ID types (queried from information_schema):
--   profiles.id                  = UUID
--   business_entities.id          = UUID
--   business_owners.profile_id    = UUID
--   business_owners.business_id   = UUID
--   client_strategy_scores.profile_id  = UUID
--   client_strategy_scores.business_id = UUID
--   strategy_library.id           = UUID
--   expert_advisor_access.expert_profile_id = TEXT (pre-existing mismatch)
--
-- Run in Supabase SQL Editor. Rollback at bottom.
-- ============================================================

BEGIN;

-- ── 1. strategy_library column additions (4 columns, no relationship data) ───
ALTER TABLE strategy_library
  ADD COLUMN IF NOT EXISTS desired_business_outcome         TEXT,
  ADD COLUMN IF NOT EXISTS advisor_review_required          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_validated                   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proprietary_implementation_steps JSONB DEFAULT '[]';

-- ── 2. recommendation_strategy_mappings ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommendation_strategy_mappings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_key  TEXT NOT NULL,
  strategy_id         UUID NOT NULL
    REFERENCES strategy_library(id) ON DELETE CASCADE,
  business_id         UUID,
  profile_id          UUID,
  mapping_scope       TEXT NOT NULL
    CHECK (mapping_scope IN ('global','category','metric','business','advisor_override')),
  match_status        TEXT NOT NULL DEFAULT 'suggested'
    CHECK (match_status IN ('suggested','confirmed','rejected','overridden','not_applicable')),
  applicability_notes TEXT,
  source              TEXT NOT NULL DEFAULT 'system',
  active              BOOLEAN NOT NULL DEFAULT true,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. recommendation_overrides ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommendation_overrides (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_key  TEXT NOT NULL,
  business_id         UUID NOT NULL,
  profile_id          UUID,
  override_type       TEXT NOT NULL
    CHECK (override_type IN (
      'confirm_strategy','replace_strategy','suppress_recommendation',
      'change_priority','defer','not_applicable','add_context'
    )),
  previous_value      JSONB,
  new_value           JSONB,
  strategy_id         UUID
    REFERENCES strategy_library(id) ON DELETE SET NULL,
  advisor_id          TEXT NOT NULL,
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at          TIMESTAMPTZ,
  active              BOOLEAN NOT NULL DEFAULT true
);

-- ── 4. Unique indexes ────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_rsm_global
  ON recommendation_strategy_mappings (recommendation_key, strategy_id, mapping_scope)
  WHERE business_id IS NULL AND profile_id IS NULL AND active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rsm_business
  ON recommendation_strategy_mappings (recommendation_key, strategy_id, business_id, mapping_scope)
  WHERE business_id IS NOT NULL AND profile_id IS NULL AND active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rsm_advisor
  ON recommendation_strategy_mappings (recommendation_key, strategy_id, business_id, profile_id, mapping_scope)
  WHERE business_id IS NOT NULL AND profile_id IS NOT NULL AND active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ro_active
  ON recommendation_overrides (recommendation_key, business_id, override_type)
  WHERE active = true AND revoked_at IS NULL;

-- ── 5. Lookup indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rsm_recommendation ON recommendation_strategy_mappings(recommendation_key);
CREATE INDEX IF NOT EXISTS idx_rsm_strategy       ON recommendation_strategy_mappings(strategy_id);
CREATE INDEX IF NOT EXISTS idx_rsm_business       ON recommendation_strategy_mappings(business_id);
CREATE INDEX IF NOT EXISTS idx_rsm_scope          ON recommendation_strategy_mappings(mapping_scope);
CREATE INDEX IF NOT EXISTS idx_rsm_active         ON recommendation_strategy_mappings(active);
CREATE INDEX IF NOT EXISTS idx_rsm_lookup          ON recommendation_strategy_mappings(recommendation_key, mapping_scope, active);

CREATE INDEX IF NOT EXISTS idx_ro_recommendation ON recommendation_overrides(recommendation_key);
CREATE INDEX IF NOT EXISTS idx_ro_business       ON recommendation_overrides(business_id);
CREATE INDEX IF NOT EXISTS idx_ro_active         ON recommendation_overrides(active);
CREATE INDEX IF NOT EXISTS idx_ro_advisor        ON recommendation_overrides(advisor_id);

-- ── 6. RLS: enable, default-deny (no permissive policies) ───────────────────
ALTER TABLE recommendation_strategy_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_overrides ENABLE ROW LEVEL SECURITY;

-- No policies created — all access is backend service-role only.
-- Authorization enforced in backend functions through:
--   - business_owners ownership check
--   - expert_advisor_access assignment check
--   - admin/super_admin app_role check

-- ── 7. Safe backfill (category-scope, suggested only) ───────────────────────
INSERT INTO recommendation_strategy_mappings (recommendation_key, strategy_id, mapping_scope, match_status, source, created_by)
SELECT
  CASE
    WHEN sl.category = 'tax'       THEN 'tax_gap_annual'
    WHEN sl.category = 'profit'    THEN 'profit_gap_amount'
    WHEN sl.category = 'value'     THEN 'value_gap_amount'
    WHEN sl.category = 'operations' THEN 'operations_score'
    WHEN sl.category = 'freedom'   THEN 'freedom_score'
  END,
  sl.id,
  'category',
  'suggested',
  'system',
  'system'
FROM strategy_library sl
WHERE sl.active = true
  AND sl.category IN ('tax', 'profit', 'value', 'operations', 'freedom')
ON CONFLICT DO NOTHING;

-- recast_valuation_increase: only for exit/transferability/EBITDA/add-back strategies
INSERT INTO recommendation_strategy_mappings (recommendation_key, strategy_id, mapping_scope, match_status, source, created_by)
SELECT 'recast_valuation_increase', sl.id, 'metric', 'suggested', 'system', 'system'
FROM strategy_library sl
WHERE sl.active = true
  AND sl.category = 'value'
  AND (
    sl.strategy_family ILIKE '%exit%'
    OR sl.strategy_family ILIKE '%transferability%'
    OR sl.strategy_family ILIKE '%normalization%'
    OR sl.strategy_family ILIKE '%add-back%'
    OR sl.strategy_family ILIKE '%ebitda%'
    OR sl.strategy_family ILIKE '%valuation%'
    OR sl.strategy_name ILIKE '%exit%'
    OR sl.strategy_name ILIKE '%recast%'
    OR sl.strategy_name ILIKE '%ebitda%'
  )
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- ROLLBACK (run only if migration needs to be reversed)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS recommendation_overrides CASCADE;
-- DROP TABLE IF EXISTS recommendation_strategy_mappings CASCADE;
-- ALTER TABLE strategy_library
--   DROP COLUMN IF EXISTS desired_business_outcome,
--   DROP COLUMN IF EXISTS advisor_review_required,
--   DROP COLUMN IF EXISTS last_validated,
--   DROP COLUMN IF EXISTS proprietary_implementation_steps;
-- COMMIT;