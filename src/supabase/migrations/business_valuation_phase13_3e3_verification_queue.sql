-- ============================================================================
-- Phase 13.3E.3 — Unified Verification Queue & Client Requests
-- ============================================================================
-- Manual execution required (SQL Editor). The Supabase connector lacks the
-- database:write scope, so DDL must be run by hand.
--
-- Tables:
--   valuation.valuation_verification_items  — queue item state overlay
--   valuation.valuation_client_requests      — advisor→client request flow
-- ============================================================================

-- ── Verification items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS valuation.valuation_verification_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id             UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  business_id              UUID,
  dedup_key                TEXT NOT NULL,
  item_type                TEXT NOT NULL,
  field_key                TEXT,
  question_key             TEXT,
  title                    TEXT NOT NULL,
  description              TEXT,
  category                 TEXT,
  priority                TEXT CHECK (priority IN ('critical','high','medium','low')),
  severity                 TEXT,
  status                   TEXT NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','in_review','waiting_on_client','waiting_on_advisor','needs_support','deferred','resolved','rejected','not_applicable','closed')),
  suggested_value          JSONB,
  formatted_value          TEXT,
  alternative_values       JSONB,
  source_type              TEXT,
  source_id                TEXT,
  source_name              TEXT,
  reporting_period         TEXT,
  confidence_score         NUMERIC,
  conflict_status          TEXT,
  financial_impact         TEXT,
  valuation_impact         TEXT,
  profitability_relevance  BOOLEAN,
  multiple_relevance       BOOLEAN,
  risk_relevance           BOOLEAN,
  responsible_party        TEXT,
  assigned_profile_id      UUID,
  due_date                 DATE,
  advisor_action_required  BOOLEAN DEFAULT TRUE,
  client_action_required   BOOLEAN DEFAULT FALSE,
  evidence_available       BOOLEAN DEFAULT FALSE,
  evidence_count           INTEGER DEFAULT 0,
  recommended_action       TEXT,
  resolution_value         JSONB,
  resolution_reason        TEXT,
  resolution_action        TEXT,
  resolved_by_profile_id   UUID,
  resolved_at              TIMESTAMPTZ,
  deferred_until           DATE,
  advisor_note             TEXT,
  metadata                 JSONB,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE (valuation_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_vvi_valuation_status
  ON valuation.valuation_verification_items (valuation_id, status);
CREATE INDEX IF NOT EXISTS idx_vvi_valuation_priority
  ON valuation.valuation_verification_items (valuation_id, priority);
CREATE INDEX IF NOT EXISTS idx_vvi_assigned
  ON valuation.valuation_verification_items (assigned_profile_id)
  WHERE assigned_profile_id IS NOT NULL;

-- ── Client requests ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS valuation.valuation_client_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id          UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  business_id           UUID,
  verification_item_id  UUID REFERENCES valuation.valuation_verification_items(id) ON DELETE SET NULL,
  request_type          TEXT NOT NULL CHECK (request_type IN ('confirmation','document','explanation','missing_value')),
  title                 TEXT NOT NULL,
  explanation           TEXT,
  why_it_matters        TEXT,
  requested_value       TEXT,
  due_date              DATE,
  assigned_client_profile_id UUID,
  advisor_note          TEXT,
  status                TEXT NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested','viewed','submitted','needs_clarification','accepted','rejected','closed')),
  submitted_value       TEXT,
  submitted_file_url    TEXT,
  submitted_at          TIMESTAMPTZ,
  created_by_profile_id UUID,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vcr_valuation
  ON valuation.valuation_client_requests (valuation_id, status);
CREATE INDEX IF NOT EXISTS idx_vcr_client
  ON valuation.valuation_client_requests (assigned_client_profile_id)
  WHERE assigned_client_profile_id IS NOT NULL;

-- ── Audit action type extension ───────────────────────────────────────────
-- The valuation_audit_log CHECK constraint already includes 'reviewed'.
-- Verification resolutions are logged with action='reviewed'.