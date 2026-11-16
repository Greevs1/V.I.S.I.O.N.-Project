-- Expert Advisor Access Control Table
-- Run this once in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS expert_advisor_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  expert_profile_id text NOT NULL,
  client_profile_id text NOT NULL,
  business_id text,
  granted_by_profile_id text,
  granted_by_role text,
  access_status text NOT NULL DEFAULT 'active', -- active | pending | revoked
  permissions jsonb NOT NULL DEFAULT '{
    "overview": true,
    "activity_feed": true,
    "outcome_tracking": false,
    "assessments": true,
    "documents": false,
    "resources": true,
    "sprints": true,
    "strategy_expansions": false,
    "freedom_projections": true,
    "galileo_summary": true,
    "notes": false
  }',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_eaa_expert ON expert_advisor_access(expert_profile_id);
CREATE INDEX IF NOT EXISTS idx_eaa_client ON expert_advisor_access(client_profile_id);
CREATE INDEX IF NOT EXISTS idx_eaa_status ON expert_advisor_access(access_status);