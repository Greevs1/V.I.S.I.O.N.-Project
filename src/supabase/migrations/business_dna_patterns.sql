-- ═══════════════════════════════════════════════════════════════════════════
-- business_dna_patterns.sql — Phase E: Business DNA Foundation
--
-- ONE additive table for Business DNA pattern persistence.
-- NOT executed automatically — generated for manual review and execution.
--
-- Constitution Compliance:
--   Article I — One Truth (DNA references evidence, never duplicates)
--   Article VI — Client Safety (nothing internal leaks externally)
--   Article XIV — Supabase is sole persistent system of record
--   Article XVII — Business DNA Authority (derived, never authoritative)
--   Article XI — Business Isolation (business_id scoped, RLS enforced)
--
-- DO NOT CREATE separate tables per DNA family. One table is sufficient.
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0. PRE-MIGRATION DEPENDENCY CHECK
-- ============================================================================
-- Fail early with a clear message if certified helper dependencies are missing.
DO $$
BEGIN
    -- Check core tables
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_entities') THEN
        RAISE EXCEPTION 'DEPENDENCY_MISSING: public.business_entities table not found. Run business creation migration first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_owners') THEN
        RAISE EXCEPTION 'DEPENDENCY_MISSING: public.business_owners table not found.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        RAISE EXCEPTION 'DEPENDENCY_MISSING: public.profiles table not found.';
    END IF;

    -- Check valuation schema exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'valuation') THEN
        RAISE EXCEPTION 'DEPENDENCY_MISSING: valuation schema not found. Run valuation auth helpers migration first.';
    END IF;

    -- Check certified valuation helper functions
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'valuation' AND routine_name = 'has_business_access') THEN
        RAISE EXCEPTION 'DEPENDENCY_MISSING: valuation.has_business_access() function not found.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'valuation' AND routine_name = 'is_super_admin') THEN
        RAISE EXCEPTION 'DEPENDENCY_MISSING: valuation.is_super_admin() function not found.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'valuation' AND routine_name = 'is_advisor_or_admin') THEN
        RAISE EXCEPTION 'DEPENDENCY_MISSING: valuation.is_advisor_or_admin() function not found.';
    END IF;

    RAISE NOTICE 'All dependencies verified. Proceeding with business_dna_patterns migration.';
END;
$$;

-- ============================================================================
-- 1. TABLE DEFINITION
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_dna_patterns (
    -- ── Identity ──────────────────────────────────────────────────────────
    -- pattern_id is the PRIMARY KEY and the sole externally referenced identifier.
    -- It is used by: Galileo, supersession, evidence_refs, audit history.
    -- No separate BIGINT id — pattern_id is sufficient and avoids duplicate identifiers.
    pattern_id TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,

    -- ── Family & Pattern ───────────────────────────────────────────────────
    family TEXT NOT NULL,
    pattern_key TEXT NOT NULL,
    title TEXT NOT NULL,
    statement TEXT NOT NULL,
    pattern_type TEXT NOT NULL DEFAULT '',

    -- ── Governed Lifecycle ─────────────────────────────────────────────────
    status TEXT NOT NULL DEFAULT 'candidate',
    strength TEXT NOT NULL DEFAULT 'moderate',
    confidence TEXT NOT NULL DEFAULT 'moderate',

    -- ── Evidence (references, not copies) ─────────────────────────────────
    -- evidence_refs stores DNAEvidenceRef[] — references to certified evidence.
    -- Each ref contains: source_domain, source_reference, lineage_root, observed_at,
    -- client_visible, advisor_confirmed. The source systems remain authoritative.
    -- Lineage root is preserved to prevent confidence inflation from duplicate rendering.
    evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_count INTEGER NOT NULL DEFAULT 0,
    independent_source_count INTEGER NOT NULL DEFAULT 0,

    -- ── Temporal ──────────────────────────────────────────────────────────
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    freshness TEXT NOT NULL DEFAULT 'current',
    direction TEXT NOT NULL DEFAULT 'unknown',
    trend TEXT NOT NULL DEFAULT '',

    -- ── Evidence Summary ──────────────────────────────────────────────────
    -- supporting_facts and contradicting_facts are BOTH preserved.
    -- Business DNA must retain material contradiction (Article XVII).
    supporting_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
    contradicting_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_domains JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- ── Client Safety ─────────────────────────────────────────────────────
    -- Default is 'advisor_internal' (safer default — patterns are internal by default).
    -- The coordinator sets the correct visibility based on family and AI input.
    client_visibility TEXT NOT NULL DEFAULT 'advisor_internal',

    -- ── Human Governance ──────────────────────────────────────────────────
    -- advisor_confirmed: a human advisor confirmed this pattern (increases confidence).
    -- advisor_contested: a human advisor contested this pattern (marks contested).
    -- AI may NEVER set advisor_confirmed = true. Only human governance actions may.
    advisor_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    advisor_contested BOOLEAN NOT NULL DEFAULT FALSE,
    advisor_confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    advisor_confirmed_at TIMESTAMPTZ,

    -- ── Implications & Relationships ────────────────────────────────────────
    implications JSONB NOT NULL DEFAULT '[]'::jsonb,
    related_pattern_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    dna_questions JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- ── Supersession ──────────────────────────────────────────────────────
    -- Historical patterns must NOT be overwritten. Supersession preserves history.
    -- Self-referential FK with ON DELETE SET NULL: if a pattern is deleted, the
    -- supersession link on the other pattern is cleared, but the other pattern survives.
    supersedes_pattern_id TEXT REFERENCES business_dna_patterns(pattern_id) ON DELETE SET NULL,
    superseded_by_pattern_id TEXT REFERENCES business_dna_patterns(pattern_id) ON DELETE SET NULL,

    -- ── Metadata ──────────────────────────────────────────────────────────
    -- Stores contradiction explanations, contest reasons, and other audit metadata.
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- ── Audit ──────────────────────────────────────────────────────────────
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ── CHECK Constraints (enum parity with TypeScript) ────────────────────
    CONSTRAINT business_dna_patterns_family_check CHECK (
        family IN ('economic', 'value', 'operating', 'decision', 'owner', 'risk_resilience')
    ),
    CONSTRAINT business_dna_patterns_status_check CHECK (
        status IN ('candidate', 'emerging', 'established', 'contested', 'weakening', 'superseded', 'retired')
    ),
    CONSTRAINT business_dna_patterns_strength_check CHECK (
        strength IN ('low', 'moderate', 'high', 'very_high')
    ),
    CONSTRAINT business_dna_patterns_confidence_check CHECK (
        confidence IN ('low', 'moderate', 'high', 'very_high')
    ),
    CONSTRAINT business_dna_patterns_freshness_check CHECK (
        freshness IN ('current', 'aging', 'stale', 'historical')
    ),
    CONSTRAINT business_dna_patterns_direction_check CHECK (
        direction IN ('improving', 'declining', 'stable', 'unknown')
    ),
    CONSTRAINT business_dna_patterns_visibility_check CHECK (
        client_visibility IN ('advisor_internal', 'client_safe')
    ),

    -- ── Structural Invariants ─────────────────────────────────────────────
    CONSTRAINT business_dna_patterns_evidence_count_nonneg CHECK (evidence_count >= 0),
    CONSTRAINT business_dna_patterns_independent_count_nonneg CHECK (independent_source_count >= 0),
    CONSTRAINT business_dna_patterns_independent_le_evidence CHECK (independent_source_count <= evidence_count),
    CONSTRAINT business_dna_patterns_temporal_order CHECK (first_observed_at <= last_observed_at),
    CONSTRAINT business_dna_patterns_no_self_supersede CHECK (
        (supersedes_pattern_id IS NULL OR supersedes_pattern_id <> pattern_id)
        AND (superseded_by_pattern_id IS NULL OR superseded_by_pattern_id <> pattern_id)
    ),
    CONSTRAINT business_dna_patterns_no_circular_supersede CHECK (
        supersedes_pattern_id IS NULL
        OR superseded_by_pattern_id IS NULL
        OR supersedes_pattern_id <> superseded_by_pattern_id
    )
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================
-- Query patterns from businessDNAService:
--   getBusinessDNA:  WHERE business_id = ? AND status <> 'retired' ORDER BY created_at DESC
--   getPatterns:     WHERE business_id = ? [AND family = ?] [AND status = ?] ORDER BY created_at DESC
--   getPattern:      WHERE pattern_id = ?
--   getEvolution:    WHERE business_id = ? ORDER BY created_at ASC
--   refreshDNA:      WHERE business_id = ? AND status <> 'retired'

CREATE INDEX IF NOT EXISTS idx_business_dna_patterns_business_id
    ON business_dna_patterns(business_id);

CREATE INDEX IF NOT EXISTS idx_business_dna_patterns_business_family
    ON business_dna_patterns(business_id, family);

CREATE INDEX IF NOT EXISTS idx_business_dna_patterns_business_status
    ON business_dna_patterns(business_id, status);

CREATE INDEX IF NOT EXISTS idx_business_dna_patterns_business_updated
    ON business_dna_patterns(business_id, updated_at DESC);

-- Partial UNIQUE index: one active pattern per (business_id, family, pattern_key).
-- Superseded/retired patterns are excluded — historical versions coexist freely.
-- This prevents duplicate active patterns without blocking pattern evolution.
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_dna_patterns_active_unique
    ON business_dna_patterns(business_id, family, pattern_key)
    WHERE status NOT IN ('retired', 'superseded');

-- ============================================================================
-- 3. UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_business_dna_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_business_dna_patterns_updated_at ON business_dna_patterns;
CREATE TRIGGER update_business_dna_patterns_updated_at
    BEFORE UPDATE ON business_dna_patterns
    FOR EACH ROW
    EXECUTE FUNCTION public.update_business_dna_patterns_updated_at();

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE business_dna_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_dna_patterns FORCE ROW LEVEL SECURITY;

-- ── RLS Policies (defense-in-depth) ────────────────────────────────────────
-- IMPORTANT: authenticated users do NOT receive a SELECT/INSERT/UPDATE/DELETE
-- grant (see GRANTS below). These policies exist as defense-in-depth — if a
-- grant is ever accidentally added, RLS still enforces business isolation and
-- visibility.
--
-- All RLS uses certified valuation.* helper functions for identity resolution
-- and business access — exactly matching the business_decisions RLS contract.
-- This ensures auth.uid() → profiles.base44_user_id → profiles.id resolution
-- is consistent across all governed tables.

-- SELECT: visibility-aware read access (defense-in-depth)
-- Super admin: all patterns
-- Advisor/admin with business access: all patterns for that business (including internal)
-- Owner with business access: only client_safe patterns (never advisor_internal)
DROP POLICY IF EXISTS business_dna_patterns_select ON business_dna_patterns;
CREATE POLICY business_dna_patterns_select ON business_dna_patterns
    FOR SELECT TO authenticated USING (
        valuation.is_super_admin()
        OR (
            valuation.has_business_access(business_id)
            AND (
                valuation.is_advisor_or_admin()
                OR client_visibility = 'client_safe'
            )
        )
    );

-- INSERT: advisors/admins with business access only (defense-in-depth)
DROP POLICY IF EXISTS business_dna_patterns_insert ON business_dna_patterns;
CREATE POLICY business_dna_patterns_insert ON business_dna_patterns
    FOR INSERT TO authenticated WITH CHECK (
        valuation.is_super_admin()
        OR (
            valuation.is_advisor_or_admin()
            AND valuation.has_business_access(business_id)
        )
    );

-- UPDATE: advisors/admins with business access only (defense-in-depth)
DROP POLICY IF EXISTS business_dna_patterns_update ON business_dna_patterns;
CREATE POLICY business_dna_patterns_update ON business_dna_patterns
    FOR UPDATE TO authenticated USING (
        valuation.is_super_admin()
        OR (
            valuation.is_advisor_or_admin()
            AND valuation.has_business_access(business_id)
        )
    ) WITH CHECK (
        valuation.is_super_admin()
        OR (
            valuation.is_advisor_or_admin()
            AND valuation.has_business_access(business_id)
        )
    );

-- DELETE: super_admin only (patterns are superseded, not deleted)
DROP POLICY IF EXISTS business_dna_patterns_delete ON business_dna_patterns;
CREATE POLICY business_dna_patterns_delete ON business_dna_patterns
    FOR DELETE TO authenticated USING (
        valuation.is_super_admin()
    );

-- ============================================================================
-- 5. GRANTS
-- ============================================================================
-- CRITICAL CLIENT-SAFETY DECISION (Article VI):
--
-- authenticated users do NOT receive direct SELECT access to business_dna_patterns.
--
-- RLS filters ROWS, not FIELDS. A client_safe row still stores internal evidence
-- in JSONB columns (evidence_refs with internal refs, contradicting_facts, advisor
-- metadata, contradiction explanations in metadata). Direct SELECT would expose
-- these internal fields even on client_safe rows.
--
-- Therefore ALL DNA reads go through businessDNAService backend actions:
--   getBusinessDNA, getPatterns, getPattern, getClientSafeDNA, getEvidence, getEvolution
-- These actions apply business authorization + client-safe filtering + evidence
-- filtering + field stripping before returning data.
--
-- service_role: full DML (used by businessDNAService with service role key, bypasses RLS)
-- authenticated: NO direct table access (all access is backend-mediated)
REVOKE ALL ON business_dna_patterns FROM authenticated;
GRANT ALL ON business_dna_patterns TO service_role;

-- ============================================================================
-- 6. COMMENT
-- ============================================================================
COMMENT ON TABLE business_dna_patterns IS 'Phase E — Business DNA Foundation. Governed derived intelligence describing durable patterns across certified business evidence. DERIVED, never authoritative. Identity: auth.uid() → profiles.base44_user_id → profiles.id (via valuation.* helpers). All reads are backend-mediated via businessDNAService — no direct authenticated SELECT (client-safety: JSONB columns contain internal evidence even on client_safe rows).';

-- ============================================================================
-- 7. RELOAD POSTGREST SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION SAFETY:
--   - Idempotent (IF NOT EXISTS, DROP IF EXISTS, CREATE OR REPLACE)
--   - Pre-migration dependency check (fails early with clear message)
--   - RLS enabled + forced
--   - CHECK constraints match TypeScript enums exactly
--   - FK to business_entities with CASCADE (DNA is derived/reconstructable)
--   - Self-referential FK for supersession with ON DELETE SET NULL
--   - FK to profiles for advisor_confirmed_by with ON DELETE SET NULL
--   - Partial UNIQUE index allows pattern evolution (historical versions coexist)
--   - Structural invariants: evidence_count, independent_count, temporal order, no self-supersede
--   - authenticated: NO direct table access (all reads through businessDNAService)
--   - service_role: full DML (backend-mediated)
--   - Certified valuation.* helper functions used for RLS (parity with business_decisions)
--   - Visibility-aware SELECT policy (owners see only client_safe patterns)
--   - PostgREST reload notification
-- ═══════════════════════════════════════════════════════════════════════════