-- Saved Playbooks — persistent strategy library
-- Run this in Supabase SQL Editor

DROP TABLE IF EXISTS saved_playbook_documents;
DROP TABLE IF EXISTS saved_playbook_notes;
DROP TABLE IF EXISTS saved_playbooks;

CREATE TABLE saved_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT,
  source TEXT DEFAULT 'galileo',
  category TEXT DEFAULT 'strategy',
  saved_from TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_saved_playbooks_profile ON saved_playbooks(profile_id);
CREATE INDEX idx_saved_playbooks_business ON saved_playbooks(business_id);
CREATE INDEX idx_saved_playbooks_deleted ON saved_playbooks(is_deleted);
CREATE INDEX idx_saved_playbooks_created ON saved_playbooks(created_at DESC);