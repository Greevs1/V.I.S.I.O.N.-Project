-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 13.3G.4 — Valuation Requests
-- Owner-submitted valuation requests + admin review/conversion workflow.
--
-- Properties:
--   • Additive only — no destructive changes to existing tables.
--   • Idempotent — safe to run multiple times.
--   • Schema-qualified — lives in the dedicated `valuation` schema.
--   • RLS-enabled — direct anon and authenticated access DENIED.
--   • Backend-mediated — only the service role (bypasses RLS) can read/write.
--
-- Manual execution only. Do NOT run from application code.
-- ══════════════════════════════════════════════════════════════════════════════

-- Ensure the valuation schema exists (no-op if already present).
CREATE SCHEMA IF NOT EXISTS valuation;

-- ────────────────────────────────────────────────────────────────────────────
-- Table: valuation.valuation_requests
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS valuation.valuation_requests (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number                  BIGINT GENERATED ALWAYS AS IDENTITY,
  business_id                     UUID NOT NULL,
  requested_by_profile_id         UUID NOT NULL,
  request_type                    TEXT NOT NULL DEFAULT 'new_valuation',
  request_reason                  TEXT,
  desired_timeline                TEXT,
  target_event_date              DATE,
  transaction_context            TEXT,
  valuation_purpose              TEXT,
  urgency                        TEXT NOT NULL DEFAULT 'no_immediate',
  notes                          TEXT,
  supporting_document_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_admin_profile_id      UUID,
  assigned_lead_advisor_id       UUID,
  status                         TEXT NOT NULL DEFAULT 'draft',
  admin_decision                 TEXT,
  admin_notes                    TEXT,
  additional_information_requested JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner_responses                JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at                   TIMESTAMPTZ,
  viewed_at                      TIMESTAMPTZ,
  reviewed_at                    TIMESTAMPTZ,
  approved_at                    TIMESTAMPTZ,
  declined_at                    TIMESTAMPTZ,
  converted_at                   TIMESTAMPTZ,
  converted_valuation_id         UUID,
  withdrawn_at                   TIMESTAMPTZ,
  closed_at                      TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valuation_requests_status_chk CHECK (
    status IN (
      'draft', 'submitted', 'received', 'under_review', 'waiting_on_owner',
      'approved', 'declined', 'converted_to_valuation', 'withdrawn', 'closed'
    )
  ),
  CONSTRAINT valuation_requests_urgency_chk CHECK (
    urgency IN ('no_immediate', 'within_90_days', 'within_30_days', 'urgent', 'target_date')
  ),
  CONSTRAINT valuation_requests_type_chk CHECK (
    request_type IN ('new_valuation', 'update_valuation', 'second_opinion')
  )
);

-- Idempotent indexes
CREATE INDEX IF NOT EXISTS idx_valuation_requests_business_id
  ON valuation.valuation_requests (business_id);

CREATE INDEX IF NOT EXISTS idx_valuation_requests_requested_by
  ON valuation.valuation_requests (requested_by_profile_id);

CREATE INDEX IF NOT EXISTS idx_valuation_requests_status
  ON valuation.valuation_requests (status);

CREATE INDEX IF NOT EXISTS idx_valuation_requests_assigned_admin
  ON valuation.valuation_requests (assigned_admin_profile_id);

CREATE INDEX IF NOT EXISTS idx_valuation_requests_created_at
  ON valuation.valuation_requests (created_at DESC);

-- Unique request number (one-based, human-readable)
CREATE UNIQUE INDEX IF NOT EXISTS uq_valuation_requests_number
  ON valuation.valuation_requests (request_number);

-- ────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- Direct access for anon and authenticated roles is DENIED.
-- Only the service role (backend functions) can read/write — it bypasses RLS.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE valuation.valuation_requests ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies (idempotent) then add a single deny-all.
DROP POLICY IF EXISTS valuation_requests_anon_deny ON valuation.valuation_requests;
DROP POLICY IF EXISTS valuation_requests_authenticated_deny ON valuation.valuation_requests;
DROP POLICY IF EXISTS valuation_requests_service_all ON valuation.valuation_requests;

-- No permissive policies = no access for anon or authenticated roles.
-- The service role bypasses RLS entirely and is the only path used by the app.

-- ────────────────────────────────────────────────────────────────────────────
-- Grants / Revocations
-- Revoke any accidental direct privileges; grant nothing to anon/authenticated.
-- ────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON valuation.valuation_requests FROM anon, authenticated, PUBLIC;

-- Grant DML to service_role (backend functions use the service-role key).
-- service_role bypasses RLS; anon/authenticated are still blocked by RLS
-- (no permissive policies exist).
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation.valuation_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation.valuation_requests TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Audit table for valuation requests (request-level event log)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS valuation.valuation_request_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        UUID NOT NULL,
  actor_profile_id  UUID,
  event_type        TEXT NOT NULL,
  previous_status   TEXT,
  new_status        TEXT,
  reason            TEXT,
  event_details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_valuation_request_events_request_id
  ON valuation.valuation_request_events (request_id, created_at DESC);

ALTER TABLE valuation.valuation_request_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS valuation_request_events_anon_deny ON valuation.valuation_request_events;
DROP POLICY IF EXISTS valuation_request_events_authenticated_deny ON valuation.valuation_request_events;
REVOKE ALL ON valuation.valuation_request_events FROM anon, authenticated, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON valuation.valuation_request_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation.valuation_request_events TO authenticated;

-- Sequence access for the IDENTITY column (request_number).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA valuation TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA valuation TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Summary of changes (SAFE TO RUN):
--   Tables created:
--     • valuation.valuation_requests
--     • valuation.valuation_request_events
--   Columns: see CREATE TABLE above (all additive).
--   Indexes: 5 on valuation_requests, 1 on valuation_request_events (all IF NOT EXISTS).
--   RLS: ENABLED on both tables; no permissive policies (anon/authenticated denied).
--   Grants: REVOKE ALL from anon, authenticated, PUBLIC on both tables.
--   No destructive changes. No data migrations. No existing table alterations.
-- ────────────────────────────────────────────────────────────────────────────