/**
 * biePersistence — Supabase persistence for BIE snapshots & journal.
 *
 * Tables (created via migration bie_persistence.sql):
 *   business_intelligence_snapshots
 *   business_intelligence_journal
 *
 * Actions:
 *   saveSnapshot     — upsert a single snapshot
 *   saveJournalEntry  — insert a single journal entry
 *   getSnapshots      — list snapshots for a business (newest first, limit 50)
 *   getJournal         — list journal entries for a business (newest first, limit 100)
 *   getLatestSnapshotVersion — return the highest version number for a business
 *
 * All operations are scoped to the authenticated user's profile_id.
 * Cross-user access is blocked at the query level (profile_id filter).
 * Admin override via _router_user_email is supported for advisor portal.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!rawUrl || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { action, data, _router_user_email } = body;

    // Admin override for advisor portal
    let resolvedEmail = user.email;
    if (_router_user_email) {
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
      resolvedEmail = _router_user_email;
    }

    // Resolve profile_id from email
    const { data: profile, error: pErr } = await sb
      .from('profiles').select('id, primary_business_id').eq('email', resolvedEmail).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profileId = profile.id;

    const businessId = data?.businessId;
    if (!businessId) return Response.json({ error: 'businessId required' }, { status: 400 });

    // ── Phase 6.6 — BUSINESS SCOPE GUARD ─────────────────────────────────────
    // This function PERSISTS business state through the service-role client, and
    // `data.businessId` previously selected the target business with no check —
    // a cross-tenant read AND write path. The caller's own primary business is
    // definitionally authorized; every other business must pass the same
    // ownership rule RLS enforces. The admin advisor-portal override is already
    // authorized for any target.
    if (!_router_user_email && businessId !== profile.primary_business_id) {
      try {
        await validateBusinessScope(sb, businessId, profileId);
      } catch (scopeErr) {
        console.error('[biePersistence] business scope denied:', scopeErr.message);
        return Response.json({ error: 'Forbidden: no access to that business' }, { status: 403 });
      }
    }

    // Helper: detect missing-table errors (PostgreSQL 42P01 or PostgREST schema cache miss)
    const isTableMissing = (err) => {
      if (!err) return false;
      if (err.code === '42P01' || err.code === 'PGRST205') return true;
      const msg = (err.message || '').toLowerCase();
      return msg.includes('could not find the table') || msg.includes('does not exist');
    };

    // ── saveSnapshot ──────────────────────────────────────────────────────────
    if (action === 'saveSnapshot') {
      const { version, changedMetrics, triggeredBy, reason, metricValues, timestamp } = data;
      const { error } = await sb.from('business_intelligence_snapshots').upsert({
        profile_id: profileId,
        business_id: businessId,
        version,
        changed_metrics: changedMetrics || [],
        triggered_by: triggeredBy || 'system',
        reason: reason || 'engine_rebuild',
        metric_values: metricValues || {},
        created_at: timestamp || new Date().toISOString(),
      }, { onConflict: 'business_id,version' });
      if (error) {
        return Response.json({ error: error.message, tableMissing: isTableMissing(error) }, { status: 500 });
      }
      return Response.json({ success: true });
    }

    // ── saveJournalEntry ──────────────────────────────────────────────────────
    if (action === 'saveJournalEntry') {
      const { id, eventType, metricId, oldValue, newValue, affectedMetrics, triggeredBy, galileoSummary, metadata, timestamp } = data;
      const { error } = await sb.from('business_intelligence_journal').insert({
        profile_id: profileId,
        business_id: businessId,
        entry_id: id,
        event_type: eventType,
        metric_id: metricId,
        old_value: oldValue,
        new_value: newValue,
        affected_metrics: affectedMetrics || [],
        triggered_by: triggeredBy || 'system',
        galileo_summary: galileoSummary || null,
        metadata: metadata || {},
        created_at: timestamp || new Date().toISOString(),
      });
      if (error) {
        return Response.json({ error: error.message, tableMissing: isTableMissing(error) }, { status: 500 });
      }
      return Response.json({ success: true });
    }

    // ── getSnapshots ──────────────────────────────────────────────────────────
    if (action === 'getSnapshots') {
      const limit = data?.limit || 50;
      const { data: rows, error } = await sb.from('business_intelligence_snapshots')
        .select('*')
        .eq('profile_id', profileId)
        .eq('business_id', businessId)
        .order('version', { ascending: true })
        .limit(limit);
      if (error) {
        return Response.json({ snapshots: [], tableMissing: isTableMissing(error) });
      }
      const snapshots = (rows || []).map(r => ({
        version: r.version,
        timestamp: r.created_at,
        changedMetrics: r.changed_metrics || [],
        reason: r.reason || 'engine_rebuild',
        triggeredBy: r.triggered_by || 'system',
        metricValues: r.metric_values || {},
      }));
      return Response.json({ snapshots });
    }

    // ── getJournal ────────────────────────────────────────────────────────────
    if (action === 'getJournal') {
      const limit = data?.limit || 100;
      const { data: rows, error } = await sb.from('business_intelligence_journal')
        .select('*')
        .eq('profile_id', profileId)
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) {
        return Response.json({ entries: [], tableMissing: isTableMissing(error) });
      }
      const entries = (rows || []).map(r => ({
        id: r.entry_id,
        eventType: r.event_type,
        metricId: r.metric_id,
        oldValue: r.old_value,
        newValue: r.new_value,
        affectedMetrics: r.affected_metrics || [],
        galileoSummary: r.galileo_summary,
        triggeredBy: r.triggered_by || 'system',
        metadata: r.metadata || {},
        timestamp: r.created_at,
      }));
      return Response.json({ entries });
    }

    // ── getLatestSnapshotVersion ──────────────────────────────────────────────
    if (action === 'getLatestSnapshotVersion') {
      const { data: rows, error } = await sb.from('business_intelligence_snapshots')
        .select('version')
        .eq('profile_id', profileId)
        .eq('business_id', businessId)
        .order('version', { ascending: false })
        .limit(1);
      if (error) {
        return Response.json({ version: 0, tableMissing: isTableMissing(error) });
      }
      return Response.json({ version: rows?.[0]?.version || 0 });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});