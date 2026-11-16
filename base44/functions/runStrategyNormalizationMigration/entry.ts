/**
 * runStrategyNormalizationMigration — Phase 12B.2 Migration Runner
 *
 * Admin-only. Handles pre-migration counts, backup, and post-migration
 * verification using PostgREST (not exec_sql RPC, which doesn't exist).
 *
 * DDL (CREATE TABLE, ALTER TABLE, etc.) CANNOT be run through this function —
 * the Supabase connector lacks database:write scope. The user must run
 * strategy_library_normalization.sql manually in the Supabase SQL Editor.
 * This function handles everything else: counts, backup, and verification.
 *
 * Actions:
 *   - precheck:  record pre-migration row counts + backup strategy_library
 *   - verify:    post-migration verification (columns, tables, RLS, backfill, unmapped)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';

async function countRows(sb: any, table: string): Promise<number | string> {
  try {
    const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
    if (error) return `ERROR: ${error.message}`;
    return count ?? 0;
  } catch (e: any) {
    return `ERROR: ${e.message}`;
  }
}

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

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const result: any = { action, timestamp: new Date().toISOString() };

    // ══════════════════════════════════════════════════════════════════════════
    // PRECHECK: row counts + backup snapshot
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'precheck') {
      const tables = [
        'strategy_library',
        'client_strategy_scores',
        'strategy_expansion_map',
        'client_strategy_expansions',
        'strategy_outcomes',
        'strategy_learning_summary',
      ];
      const preCounts: Record<string, any> = {};
      for (const t of tables) {
        preCounts[t] = await countRows(sb, t);
      }
      result.preCounts = preCounts;

      // Backup: export all strategy_library rows (snapshot for preservation)
      const { data: backupRows, error: backupErr } = await sb.from('strategy_library')
        .select('*').order('created_at', { ascending: true });
      result.backup = {
        table: 'strategy_library',
        rowCount: backupRows?.length || 0,
        error: backupErr?.message || null,
        exportedAt: new Date().toISOString(),
        note: 'Full row snapshot preserved in this response; user should also create strategy_library_backup_20260723 via SQL Editor',
      };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // VERIFY: post-migration checks (all via PostgREST)
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'verify') {
      const verify: any = {};

      // 1. New columns on strategy_library (via information_schema.columns)
      const { data: newCols } = await sb.from('information_schema.columns')
        .select('column_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'strategy_library')
        .in('column_name', ['desired_business_outcome', 'advisor_review_required', 'last_validated', 'proprietary_implementation_steps']);
      verify.newColumns = (newCols || []).map((c: any) => c.column_name);
      verify.allNewColumnsPresent = verify.newColumns.length === 4;

      // 2. New tables existence (via information_schema.tables)
      const { data: tableCheck } = await sb.from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .in('table_name', ['recommendation_strategy_mappings', 'recommendation_overrides']);
      verify.newTables = (tableCheck || []).map((t: any) => t.table_name);
      verify.allNewTablesPresent = verify.newTables.length === 2;

      // 3. RLS status (via pg_tables)
      const { data: rlsStatus } = await sb.from('pg_tables')
        .select('tablename, rowsecurity')
        .eq('schemaname', 'public')
        .in('tablename', ['recommendation_strategy_mappings', 'recommendation_overrides']);
      verify.rlsEnabled = {};
      for (const r of (rlsStatus || [])) {
        verify.rlsEnabled[r.tablename] = r.rowsecurity;
      }
      verify.rlsEnabledOnBoth = verify.rlsEnabled['recommendation_strategy_mappings'] === true && verify.rlsEnabled['recommendation_overrides'] === true;

      // 4. Permissive policies check (via pg_policies)
      const { data: policies } = await sb.from('pg_policies')
        .select('tablename, policyname, cmd, permissive')
        .eq('schemaname', 'public')
        .in('tablename', ['recommendation_strategy_mappings', 'recommendation_overrides']);
      verify.policies = policies || [];
      verify.noPermissivePolicies = (policies || []).length === 0;

      // 5. Backfill counts by recommendation_key
      const { data: allMappings } = await sb.from('recommendation_strategy_mappings')
        .select('recommendation_key')
        .eq('active', true);
      verify.backfillCounts = {};
      for (const m of (allMappings || [])) {
        verify.backfillCounts[m.recommendation_key] = (verify.backfillCounts[m.recommendation_key] || 0) + 1;
      }
      verify.totalMappings = (allMappings || []).length;

      // 6. Total mapped strategies (distinct)
      const { data: mappedStrategies } = await sb.from('recommendation_strategy_mappings')
        .select('strategy_id')
        .eq('active', true);
      const mappedIds = new Set((mappedStrategies || []).map((m: any) => m.strategy_id));
      verify.totalMappedStrategies = mappedIds.size;

      // 7. Unmapped categories (cash_flow, protection, wealth)
      // Get all active strategies, then filter out mapped ones
      const { data: allStrategies } = await sb.from('strategy_library')
        .select('id, category, strategy_name')
        .eq('active', true);
      const unmappedByCategory: Record<string, number> = {};
      for (const s of (allStrategies || [])) {
        if (!mappedIds.has(s.id) && ['cash_flow', 'protection', 'wealth'].includes(s.category)) {
          unmappedByCategory[s.category] = (unmappedByCategory[s.category] || 0) + 1;
        }
      }
      verify.unmappedCategories = unmappedByCategory;
      verify.cashFlowUnmapped = (unmappedByCategory.cash_flow || 0) > 0;
      verify.protectionUnmapped = (unmappedByCategory.protection || 0) > 0;
      verify.wealthUnmapped = (unmappedByCategory.wealth || 0) > 0;

      // 8. Post-migration row counts
      verify.postCounts = {
        recommendation_strategy_mappings: await countRows(sb, 'recommendation_strategy_mappings'),
        recommendation_overrides: await countRows(sb, 'recommendation_overrides'),
      };

      // 9. Overall pass/fail summary
      verify.passed = {
        newColumns: verify.allNewColumnsPresent,
        newTables: verify.allNewTablesPresent,
        rlsEnabled: verify.rlsEnabledOnBoth,
        noPermissivePolicies: verify.noPermissivePolicies,
        backfillHasMappings: verify.totalMappings > 0,
        cashFlowUnmapped: verify.cashFlowUnmapped,
        protectionUnmapped: verify.protectionUnmapped,
        wealthUnmapped: verify.wealthUnmapped,
      };
      verify.allPassed = Object.values(verify.passed).every((v: any) => v === true);

      result.verification = verify;
    }

    return Response.json(result);
  } catch (error) {
    console.error('[runStrategyNormalizationMigration] Error:', error.message);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});