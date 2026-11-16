-- BIE Persistence — Phase 7
-- Run this migration in Supabase SQL Editor to enable backend persistence
-- for Business Intelligence Engine snapshots and journal entries.

-- ── Snapshots table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_intelligence_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_id     TEXT NOT NULL,
  version         INTEGER NOT NULL,
  changed_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  metric_values   JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_by    TEXT NOT NULL DEFAULT 'system',
  reason          TEXT NOT NULL DEFAULT 'engine_rebuild',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, version)
);

CREATE INDEX IF NOT EXISTS idx_bie_snapshots_profile_business
  ON business_intelligence_snapshots (profile_id, business_id, version);

-- ── Journal table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_intelligence_journal (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_id       TEXT NOT NULL,
  entry_id          TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  metric_id         TEXT,
  old_value         JSONB,
  new_value         JSONB,
  affected_metrics  JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_by      TEXT NOT NULL DEFAULT 'system',
  galileo_summary   TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_bie_journal_profile_business
  ON business_intelligence_journal (profile_id, business_id, created_at);

-- ── RLS Policies ──────────────────────────────────────────────────────────────
-- Snapshots: users can only see their own profile's snapshots
ALTER TABLE business_intelligence_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY bie_snapshots_select_own ON business_intelligence_snapshots
  FOR SELECT USING (profile_id = auth.uid()::text::uuid OR auth.role() = 'service_role');

CREATE POLICY bie_snapshots_insert_own ON business_intelligence_snapshots
  FOR INSERT WITH CHECK (profile_id = auth.uid()::text::uuid OR auth.role() = 'service_role');

CREATE POLICY bie_snapshots_update_own ON business_intelligence_snapshots
  FOR UPDATE USING (profile_id = auth.uid()::text::uuid OR auth.role() = 'service_role');

-- Journal: users can only see their own profile's journal
ALTER TABLE business_intelligence_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY bie_journal_select_own ON business_intelligence_journal
  FOR SELECT USING (profile_id = auth.uid()::text::uuid OR auth.role() = 'service_role');

CREATE POLICY bie_journal_insert_own ON business_intelligence_journal
  FOR INSERT WITH CHECK (profile_id = auth.uid()::text::uuid OR auth.role() = 'service_role');

CREATE POLICY bie_journal_update_own ON business_intelligence_journal
  FOR UPDATE USING (profile_id = auth.uid()::text::uuid OR auth.role() = 'service_role');