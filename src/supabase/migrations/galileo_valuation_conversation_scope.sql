-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 13.4A.2 — Galileo Valuation Conversation Scope
--
-- Additive, idempotent, non-destructive migration to support five-field
-- conversation scoping for Galileo valuation conversations.
--
-- Fields added:
--   valuation_id       UUID  — the valuation this conversation is scoped to
--   conversation_mode  TEXT  — 'general' | 'valuation_advisor'
--   visibility_scope   TEXT  — 'internal' | 'client_safe'
--
-- These columns are nullable with defaults so existing conversations
-- remain valid (treated as general/internal with no valuation).
--
-- RLS: No changes — the existing RLS policy on galileo_conversations
-- remains authoritative. Service-role bypasses RLS for backend mediation.
--
-- Manually execute in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Additive columns (IF NOT EXISTS for idempotency)
ALTER TABLE galileo_conversations
  ADD COLUMN IF NOT EXISTS valuation_id UUID DEFAULT NULL;

ALTER TABLE galileo_conversations
  ADD COLUMN IF NOT EXISTS conversation_mode TEXT DEFAULT 'general';

ALTER TABLE galileo_conversations
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT DEFAULT 'internal';

-- Index for efficient scope-based lookup
-- Only indexes rows with a valuation_id (valuation-scoped conversations)
CREATE INDEX IF NOT EXISTS galileo_conversations_valuation_scope_idx
  ON galileo_conversations (profile_id, business_id, valuation_id, conversation_mode, visibility_scope)
  WHERE valuation_id IS NOT NULL;

-- Backfill existing conversations as general/internal (no-op if columns already defaulted)
-- This is safe because the columns have defaults.
UPDATE galileo_conversations
  SET conversation_mode = COALESCE(conversation_mode, 'general'),
      visibility_scope = COALESCE(visibility_scope, 'internal')
  WHERE conversation_mode IS NULL OR visibility_scope IS NULL;

-- Add check constraint for conversation_mode values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galileo_conversations_conversation_mode_check'
  ) THEN
    ALTER TABLE galileo_conversations
      ADD CONSTRAINT galileo_conversations_conversation_mode_check
      CHECK (conversation_mode IN ('general', 'valuation_advisor'));
  END IF;
END $$;

-- Add check constraint for visibility_scope values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galileo_conversations_visibility_scope_check'
  ) THEN
    ALTER TABLE galileo_conversations
      ADD CONSTRAINT galileo_conversations_visibility_scope_check
      CHECK (visibility_scope IN ('internal', 'client_safe'));
  END IF;
END $$;

-- Grant service_role access (maintain existing grants)
GRANT SELECT, INSERT, UPDATE ON galileo_conversations TO service_role;