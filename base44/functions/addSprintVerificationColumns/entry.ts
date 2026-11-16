/**
 * addSprintVerificationColumns
 * One-time migration: adds verification + verifier assignment columns to ninety_day_sprint_paths.
 * Uses direct postgres connection via DATABASE_URL.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import postgres from 'npm:postgres@3.4.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Admins only' }, { status: 403 });
    }

    const dbUrl = Deno.env.get('DATABASE_URL') || Deno.env.get('SUPABASE_DB_URL');
    if (!dbUrl) return Response.json({ error: 'DATABASE_URL not configured' }, { status: 500 });

    const sql = postgres(dbUrl, { ssl: 'require', max: 1 });

    const migrations = [
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'galileo_verified_pending_expert'`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS galileo_verified BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS expert_verified BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS expert_verified_by TEXT`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS expert_verified_at TIMESTAMPTZ`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS verification_notes TEXT`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS needs_expert_review BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS last_galileo_update_at TIMESTAMPTZ`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_profile_id TEXT`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_name TEXT`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_email TEXT`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_role TEXT`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_at TIMESTAMPTZ`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_by TEXT`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS verification_assignment_status TEXT DEFAULT 'unassigned'`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS client_name TEXT`,
      `ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS business_name TEXT`,
    ];

    const results = [];
    for (const stmt of migrations) {
      const colName = stmt.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1] || stmt;
      try {
        await sql.unsafe(stmt);
        results.push({ column: colName, status: 'ok' });
      } catch (e) {
        results.push({ column: colName, status: 'error', error: e.message });
      }
    }

    await sql.end();

    return Response.json({ results, message: 'Migration complete — please reload the app to clear Supabase schema cache.' });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});