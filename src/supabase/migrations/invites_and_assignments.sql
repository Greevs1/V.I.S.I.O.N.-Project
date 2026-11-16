-- Run this in Supabase SQL Editor to create invite + resource assignment tables

-- 1. Team Invites
CREATE TABLE IF NOT EXISTS public.team_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invited_email TEXT NOT NULL,
  invited_role TEXT NOT NULL DEFAULT 'user',
  invited_by TEXT,
  company_id TEXT,
  profile_id TEXT,
  business_id TEXT,
  invite_token TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_invites_email ON team_invites(invited_email);
CREATE INDEX IF NOT EXISTS idx_team_invites_status ON team_invites(status);

-- 2. Resource Assignments
CREATE TABLE IF NOT EXISTS public.resource_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_document_id UUID NOT NULL,
  profile_id TEXT,
  business_id TEXT,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ra_profile ON resource_assignments(profile_id);
CREATE INDEX IF NOT EXISTS idx_ra_doc ON resource_assignments(resource_document_id);