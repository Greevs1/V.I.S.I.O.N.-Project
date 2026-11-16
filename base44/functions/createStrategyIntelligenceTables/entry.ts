/**
 * createStrategyIntelligenceTables — One-time migration runner
 * Creates strategy_library and client_strategy_scores tables in Supabase.
 * Run once by a super_admin. Safe to re-run (uses IF NOT EXISTS).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Role check — super_admin only
    const { data: profile } = await sb.from('profiles').select('app_role').eq('email', user.email).maybeSingle();
    const isSuperAdmin = profile?.app_role === 'super_admin' || user.role === 'admin';
    if (!isSuperAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const results = {};

    // ── Use Supabase Management API for DDL (tables can't be created via REST) ──
    // We use a workaround: insert a test record to detect if table exists,
    // then report back to the admin with SQL to run manually if needed.

    // ── 1. Check if strategy_library exists ────────────────────────────────────
    const { error: sl_check } = await sb.from('strategy_library').select('id').limit(1);
    results.strategy_library = sl_check
      ? { exists: false, needs_creation: true, error: sl_check.message }
      : { exists: true };

    // ── 2. Check if client_strategy_scores exists ──────────────────────────────
    const { error: css_check } = await sb.from('client_strategy_scores').select('id').limit(1);
    results.client_strategy_scores = css_check
      ? { exists: false, needs_creation: true, error: css_check.message }
      : { exists: true };

    const bothExist = !results.strategy_library.error && !results.client_strategy_scores.error;

    const SQL_TO_RUN = bothExist ? null : `-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard)

CREATE TABLE IF NOT EXISTS strategy_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL,
  category TEXT NOT NULL,
  strategy_family TEXT,
  description TEXT,
  ideal_client_profile TEXT,
  ideal_industries JSONB DEFAULT '[]',
  minimum_revenue NUMERIC,
  maximum_revenue NUMERIC,
  implementation_difficulty TEXT DEFAULT 'medium',
  implementation_days INTEGER DEFAULT 90,
  expected_profit_impact_type TEXT,
  expected_profit_impact_value NUMERIC,
  expected_tax_impact_type TEXT,
  expected_tax_impact_value NUMERIC,
  expected_value_impact_type TEXT,
  expected_value_impact_value NUMERIC,
  expected_cash_flow_impact_type TEXT,
  expected_cash_flow_impact_value NUMERIC,
  expected_freedom_acceleration_months NUMERIC DEFAULT 0,
  required_data_points JSONB DEFAULT '[]',
  required_documents JSONB DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  contraindications TEXT,
  confidence_score NUMERIC DEFAULT 75,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_strategy_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  business_id UUID NOT NULL,
  strategy_id UUID,
  opportunity_score NUMERIC,
  impact_score NUMERIC,
  confidence_score NUMERIC,
  ease_score NUMERIC,
  urgency_score NUMERIC,
  time_to_value_score NUMERIC,
  freedom_score NUMERIC,
  projected_profit_impact NUMERIC,
  projected_tax_impact NUMERIC,
  projected_value_impact NUMERIC,
  projected_cash_flow_impact NUMERIC,
  projected_freedom_acceleration_months NUMERIC,
  recommendation_reason TEXT,
  evidence_used JSONB DEFAULT '[]',
  missing_data JSONB DEFAULT '[]',
  priority_rank INTEGER,
  status TEXT DEFAULT 'recommended',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_library_category ON strategy_library(category);
CREATE INDEX IF NOT EXISTS idx_strategy_library_active ON strategy_library(active);
CREATE INDEX IF NOT EXISTS idx_client_strategy_scores_business ON client_strategy_scores(business_id);
CREATE INDEX IF NOT EXISTS idx_client_strategy_scores_profile ON client_strategy_scores(profile_id);`;

    return Response.json({
      success: bothExist,
      message: bothExist
        ? 'Both tables already exist. You can now run the seed action in strategyLibrary.'
        : 'Tables need to be created. Copy the SQL below and run it in your Supabase SQL Editor, then call this endpoint again to verify.',
      results,
      sql_to_run: SQL_TO_RUN,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});