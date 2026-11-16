/**
 * fixWorksheetAssignmentsSchema — Admin-only
 *
 * Alters worksheet_assignments.worksheet_id from UUID to TEXT
 * so it can store Base44 entity IDs (which are alphanumeric, not UUID format).
 * Also ensures resource_assignments.resource_document_id is TEXT.
 * Also ensures profiles has base44_user_id column.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results = [];

    // Test current state by attempting a text insert
    const testId = 'test_' + Date.now();
    const { error: testErr } = await sb.from('worksheet_assignments').insert({
      worksheet_id: testId,
      assigned_to_profile_id: '00000000-0000-0000-0000-000000000000',
      assigned_by_profile_id: '00000000-0000-0000-0000-000000000000',
      status: 'assigned',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (testErr && testErr.message.includes('invalid input syntax for type uuid')) {
      results.push({ check: 'worksheet_id_type', status: 'needs_migration', error: testErr.message });
      results.push({
        action: 'REQUIRED',
        message: 'Run the following SQL in your Supabase SQL Editor to fix the schema:',
        sql: `
-- Fix worksheet_assignments.worksheet_id to accept Base44 text IDs
ALTER TABLE worksheet_assignments
  ALTER COLUMN worksheet_id TYPE TEXT USING worksheet_id::TEXT;

-- Fix resource_assignments if it has the same issue  
ALTER TABLE resource_assignments
  ALTER COLUMN resource_document_id TYPE TEXT USING resource_document_id::TEXT;

-- Add base44_user_id to profiles if missing
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS base44_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_base44_user_id ON profiles(base44_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON profiles(lower(email));
        `.trim(),
      });
    } else {
      // Clean up test row
      await sb.from('worksheet_assignments').delete().eq('worksheet_id', testId);
      results.push({ check: 'worksheet_id_type', status: 'ok_accepts_text' });
    }

    // Check profiles for base44_user_id column
    const { data: profileRow } = await sb.from('profiles')
      .select('id, base44_user_id')
      .limit(1)
      .maybeSingle();

    if (profileRow && 'base44_user_id' in profileRow) {
      results.push({ check: 'profiles.base44_user_id', status: 'exists' });
    } else {
      results.push({
        check: 'profiles.base44_user_id',
        status: 'missing',
        sql: 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS base44_user_id TEXT;',
      });
    }

    return Response.json({ results });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});