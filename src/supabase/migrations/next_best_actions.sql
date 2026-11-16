-- Next Best Actions Table
-- Stores prioritized, actionable recommendations for business owners

CREATE TABLE IF NOT EXISTS next_best_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Action details
  title TEXT NOT NULL,
  description TEXT,
  action_type TEXT NOT NULL, -- 'data_review', 'continue_roadmap', 'opportunity', 'complete_assessment', 'upload_documents', 'wait_for_analysis'
  category TEXT, -- 'data_quality', 'operations', 'tax', 'profit', 'value', 'assessment', 'general'
  
  -- Scoring
  priority_score INTEGER DEFAULT 50, -- 0-100
  estimated_impact NUMERIC, -- Dollar value if available
  expected_time_days INTEGER, -- Estimated days to complete
  difficulty_level TEXT, -- 'easy', 'medium', 'hard'
  
  -- Context
  reason TEXT, -- Why this action is recommended
  source TEXT, -- 'document_extraction', 'roadmap', 'business_opportunities', 'onboarding', 'system'
  source_record_id UUID, -- ID of the source record (opportunity, roadmap item, etc.)
  
  -- Status tracking
  status TEXT DEFAULT 'recommended', -- 'recommended', 'accepted', 'in_progress', 'completed', 'dismissed'
  due_date DATE,
  assigned_to UUID REFERENCES profiles(id),
  
  -- Timestamps
  accepted_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nba_business_status ON next_best_actions(business_id, status);
CREATE INDEX IF NOT EXISTS idx_nba_priority ON next_best_actions(business_id, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_nba_source ON next_best_actions(source_record_id);
CREATE INDEX IF NOT EXISTS idx_nba_action_type ON next_best_actions(action_type);

-- RLS Policies
ALTER TABLE next_best_actions ENABLE ROW LEVEL SECURITY;

-- Owners can view their own actions
CREATE POLICY "Owners can view own actions"
  ON next_best_actions
  FOR SELECT
  USING (
    profile_id = (SELECT id FROM profiles WHERE email = auth.jwt()->>'email')
    OR business_id IN (
      SELECT id FROM businesses WHERE profile_id = (SELECT id FROM profiles WHERE email = auth.jwt()->>'email')
    )
  );

-- Owners can update their own actions (accept/dismiss)
CREATE POLICY "Owners can update own actions"
  ON next_best_actions
  FOR UPDATE
  USING (
    profile_id = (SELECT id FROM profiles WHERE email = auth.jwt()->>'email')
    OR business_id IN (
      SELECT id FROM businesses WHERE profile_id = (SELECT id FROM profiles WHERE email = auth.jwt()->>'email')
    )
  );

-- Advisors can view assigned businesses
CREATE POLICY "Advisors can view assigned actions"
  ON next_best_actions
  FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM advisor_assignments 
      WHERE advisor_profile_id = (SELECT id FROM profiles WHERE email = auth.jwt()->>'email')
    )
  );

-- Advisors can update assigned actions
CREATE POLICY "Advisors can update assigned actions"
  ON next_best_actions
  FOR UPDATE
  USING (
    business_id IN (
      SELECT business_id FROM advisor_assignments 
      WHERE advisor_profile_id = (SELECT id FROM profiles WHERE email = auth.jwt()->>'email')
    )
  );

-- Super admins can do everything
CREATE POLICY "Super admins full access"
  ON next_best_actions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE email = auth.jwt()->>'email' 
      AND app_role = 'super_admin'
    )
  );

COMMENT ON TABLE next_best_actions IS 'Prioritized next best actions for business owners';
COMMENT ON COLUMN next_best_actions.action_type IS 'Type of action: data_review, continue_roadmap, opportunity, complete_assessment, upload_documents, wait_for_analysis';
COMMENT ON COLUMN next_best_actions.status IS 'Status: recommended, accepted, in_progress, completed, dismissed';
COMMENT ON COLUMN next_best_actions.difficulty_level IS 'Difficulty: easy (< 1 day), medium (1-4 weeks), hard (> 1 month)';