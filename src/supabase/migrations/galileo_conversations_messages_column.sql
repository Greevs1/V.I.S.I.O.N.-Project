-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 13.4A.2 Live Validation — Fix Missing messages Column
--
-- The galileo_conversations table was missing the `messages` JSONB column
-- that askGalileo uses to persist conversation history. This is a pre-existing
-- bug (not caused by Phase 13.4A.2) that prevented all conversation persistence.
--
-- This migration is additive and idempotent.
--
-- Manually execute in Supabase SQL Editor, then run:
--   NOTIFY pgrst, 'reload schema';
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE galileo_conversations
  ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;

-- Also add questions_used for parity with the GalileoConversation entity schema
ALTER TABLE galileo_conversations
  ADD COLUMN IF NOT EXISTS questions_used INTEGER DEFAULT 0;

-- Grant service_role access (maintain existing grants)
GRANT SELECT, INSERT, UPDATE ON galileo_conversations TO service_role;