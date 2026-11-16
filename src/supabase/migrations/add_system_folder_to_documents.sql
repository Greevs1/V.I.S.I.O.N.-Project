-- Migration: add system_folder column to documents table
-- This column stores the user-assigned or auto-classified folder ID
-- (one of the SYSTEM_FOLDERS ids from lib/documentReadiness.js)
-- Default is NULL, meaning auto-categorization applies via suggestFolder()

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS system_folder TEXT DEFAULT NULL;

-- Index for fast folder-scoped queries
CREATE INDEX IF NOT EXISTS idx_documents_system_folder
  ON documents (system_folder)
  WHERE system_folder IS NOT NULL;