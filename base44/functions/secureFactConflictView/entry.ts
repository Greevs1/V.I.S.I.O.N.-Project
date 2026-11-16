/**
 * secureFactConflictView — Phase 6D.1A — GATE 1 (posture probe + exact repair text)
 *
 * WHY THIS FUNCTION EXISTS RATHER THAN A MIGRATION APPLIED IN CODE
 *
 *   The Supabase connector available to this app carries `database:read` only, and
 *   the project exposes no `exec_sql`-style RPC (the same limitation the existing
 *   `runStrategyNormalizationMigration` documents). DDL therefore CANNOT be applied
 *   by application code here — a security migration that silently did nothing would
 *   be worse than none at all. So this function does the two things it honestly can:
 *
 *     1. PROBE the live posture read-only and report it, with `applied` a measured
 *        boolean or the literal 'unknown' — never an optimistic guess.
 *     2. RETURN the exact, idempotent SQL to run, with the direct SQL-editor link.
 *
 *   The migration itself is versioned in the repository:
 *     src/supabase/migrations/phase_6d_1a_secure_fact_conflicts.sql
 *     src/supabase/migrations/phase_6d_1a_secure_fact_conflicts_verification.sql
 *
 * ACCESS: canonical admin / super_admin only.
 * THIS FUNCTION PERFORMS NO WRITE OF ANY KIND.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';

const REPAIR_SQL = `-- 6D.1A Gate 1 — secure public.business_fact_conflicts (idempotent)
begin;
alter view public.business_fact_conflicts set (security_invoker = true);
revoke all on public.business_fact_conflicts from public;
revoke all on public.business_fact_conflicts from anon;
grant select on public.business_fact_conflicts to authenticated;
commit;`;

const VERIFY_SQL = `-- 6D.1A Gate 1 verification — expect anon_can_select = false,
-- reloptions = {security_invoker=true}, and 0 / 0 fact rows.
select c.relname, c.reloptions, c.relrowsecurity,
       has_table_privilege('anon', c.oid, 'select')          as anon_can_select,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_can_select
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('business_facts','business_fact_evidence','business_fact_conflicts')
order by c.relname;

select (select count(*) from public.business_facts)          as business_facts_rows,
       (select count(*) from public.business_fact_evidence)  as business_fact_evidence_rows;`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || null;

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── PROBE: what can be MEASURED from here? ──────────────────────────────
    // A MEASURED FACT about this database, established read-only during the Phase 0
    // audit: `has_table_privilege('anon', 'public.business_fact_conflicts', 'select')`
    // is TRUE while `information_schema.role_table_grants` returns NO ROW for that
    // view at all. The privilege is therefore inherited from the PUBLIC pseudo-role,
    // NOT granted to `anon` explicitly.
    //
    // That has two consequences this function is built around:
    //   1. REVOKING FROM `anon` ALONE WOULD NOT FIX ANYTHING. The migration revokes
    //      from PUBLIC first; this probe states why.
    //   2. An explicit-grant probe CANNOT see the hole, so it can never report
    //      `applied: true` on its own. Claiming otherwise would be worse than saying
    //      nothing — a security gate that reports success it did not measure is a
    //      false negative in the exact place it matters.
    let explicitAnonGrant = false;
    let explicitAuthenticatedGrant = false;
    let probeError: string | null = null;
    try {
      const { data, error } = await sb
        .from('role_table_grants')
        .select('grantee,privilege_type')
        .eq('table_schema', 'public')
        .eq('table_name', 'business_fact_conflicts')
        .eq('privilege_type', 'SELECT');
      if (error) probeError = error.message;
      else {
        const grantees = new Set((data || []).map((g: any) => String(g.grantee)));
        explicitAnonGrant = grantees.has('anon');
        explicitAuthenticatedGrant = grantees.has('authenticated');
      }
    } catch (e: any) {
      probeError = e?.message || 'probe failed';
    }

    return Response.json({
      gate: 'GATE_1_BUSINESS_FACT_CONFLICTS',
      writes_performed: false,
      posture: {
        explicit_grant_to_anon: explicitAnonGrant,
        explicit_grant_to_authenticated: explicitAuthenticatedGrant,
        anon_can_select: 'not measurable through PostgREST — the privilege is inherited from PUBLIC',
        security_invoker: 'not measurable through PostgREST (view reloptions)',
        probe_error: probeError,
      },
      applied: 'unknown',
      applied_confidence: 'not_measurable_via_rest',
      note: 'This probe CANNOT confirm the repair: the anon privilege on the conflict view is inherited from PUBLIC, so it has no explicit grantee row to inspect. Run VERIFY_SQL (it uses has_table_privilege and reads reloptions) and accept the repair only on that result.',
      repair_sql: REPAIR_SQL,
      verify_sql: VERIFY_SQL,
      migration_files: [
        'src/supabase/migrations/phase_6d_1a_secure_fact_conflicts.sql',
        'src/supabase/migrations/phase_6d_1a_secure_fact_conflicts_verification.sql',
      ],
      supabase_sql_editor_url: projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : null,
    });
  } catch (error: any) {
    console.error('[secureFactConflictView] Error:', error?.message);
    return Response.json({ error: error?.message || 'probe failed' }, { status: 500 });
  }
});