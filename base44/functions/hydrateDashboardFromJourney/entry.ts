/**
 * hydrateDashboardFromJourney
 *
 * Canonical function that converts Journey assessment answers into:
 * 1. Base44 Assessment entities (so getAssessmentSummary can read them)
 * 2. Supabase dashboard_metrics row (for fast dashboard load)
 * 3. Supabase business_metric_snapshots (for historical tracking)
 *
 * Called from JourneySignup after OTP verification succeeds.
 * Must be called with authenticated context.
 *
 * Returns a detailed report so the caller knows what succeeded/failed.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { guest_session_id, assessment_answers: inlineAnswers } = body;

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!rawUrl || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const now = new Date().toISOString();
    const report = {
      profit_gap:         { written: false, dashboard_ready: false },
      value_gap:          { written: false, dashboard_ready: false },
      recast_ebitda:      { written: false, dashboard_ready: false },
      tax_gap:            { written: false, dashboard_ready: false },
      operations_gap:     { written: false, dashboard_ready: false },
      freedom_assessment: { written: false, dashboard_ready: false },
      dashboard_ready: false,
      metrics_synced: false,
      metrics_error: null,
      warnings: [],
    };

    // ── 1. Resolve assessment_answers ───────────────────────────────────────────
    // inlineAnswers (from sessionStorage) are the primary source — they're
    // always the most up-to-date since guest save is fire-and-forget.
    // Supabase guest_session is used only to fill gaps if inline is missing a type.
    let assessment_answers = inlineAnswers || {};

    if (guest_session_id) {
      try {
        const { data: gs } = await sb.from('guest_sessions')
          .select('assessment_answers')
          .eq('guest_session_id', guest_session_id)
          .maybeSingle();
        if (gs?.assessment_answers && Object.keys(gs.assessment_answers).length > 0) {
          // Inline wins: only fill in types that inline is missing
          const merged = { ...gs.assessment_answers };
          for (const [k, v] of Object.entries(assessment_answers)) {
            merged[k] = v; // inline always overwrites Supabase for same key
          }
          assessment_answers = merged;
        }
      } catch (e) {
        report.warnings.push('guest_session fetch failed: ' + e.message);
      }
    }

    if (Object.keys(assessment_answers).length === 0) {
      return Response.json({ error: 'No assessment_answers found', report }, { status: 400 });
    }

    // ── 2. Resolve profile_id ────────────────────────────────────────────────────
    const { data: profile } = await sb.from('profiles')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();
    const profile_id = profile?.id || null;

    // ── 3. Write Base44 Assessment entities ─────────────────────────────────────
    for (const [assessmentType, assessmentData] of Object.entries(assessment_answers)) {
      if (!assessmentData?.answers) {
        report.warnings.push(`Skipped ${assessmentType}: no answers`);
        continue;
      }
      // FROZEN (Phase C.1): Base44 Assessment writes retired.
      // Supabase is the sole authoritative store. Historical records preserved read-only.
      report[assessmentType] = { ...report[assessmentType], written: false, frozen: true };
    }

    // ── 4. Build dashboard_metrics payload ──────────────────────────────────────
    if (profile_id) {
      try {
        const aa = assessment_answers;
        const pg = aa['profit_gap']?.results || {};
        const pgA = aa['profit_gap']?.answers || {};
        const vg = aa['value_gap']?.results || {};
        const tg = aa['tax_gap']?.results || {};
        const og = aa['operations_gap']?.results || {};
        const re = aa['recast_ebitda']?.results || {};
        const fa = aa['freedom_assessment']?.results || {};

        // ── Canonical field mapping — Phase 6B.2 ─────────────────────────────
        // `??` replaces `||`: `||` treats a legitimate 0 as absent, which both
        // dropped valid zero results and made every guard read as "no data".
        // A value that is genuinely absent stays null; it is never coerced to 0.
        const profit_gap_amount = pg.profit_gap ?? pg.gapToBest ?? pg.gap_to_best ?? pg.gap_to_benchmark ?? null;
        const profit_gap_to_avg = pg.profit_gap_to_avg ?? pg.gapToAvg ?? pg.gap_to_avg ?? null;
        const current_margin = pg.current_margin ?? pg.currentMargin ?? pgA.p1_mymargin ?? null;

        const value_gap_amount = vg.value_gap ?? vg.valueGap ?? vg.gap_amount ?? null;
        const current_value = vg.current_value ?? vg.currentValue ?? null;
        const potential_value = vg.potential_value ?? vg.potentialValue ?? null;

        const tax_annual = tg.t3_annual_gap ?? tg.totalAnnualSavings ?? tg.annual_gap ?? null;

        const ops_score = og.operations_score ?? og.operationsScore ?? null;
        const monthly_take_home = og.monthly_take_home ?? pgA.o4_takehome ?? aa['operations_gap']?.answers?.o4_takehome ?? null;
        const hours_worked_per_week = og.hours_worked_per_week ?? aa['operations_gap']?.answers?.o4_hrs ?? null;
        const hourly_value_of_time_freed =
          og.hourly_value_of_time_freed ?? og.hourly_value ?? og.hourly_value_freed ?? null;
        const monthly_value_of_time_freed =
          og.monthly_value_of_time_freed ?? og.monthly_value_freed ?? og.monthlyValueFreed ?? null;
        const hours_freed_per_week = og.hours_freed_per_week ?? og.freed_hours_per_week ?? null;

        const recast_add_backs = re.total_addbacks ?? re.totalAddBacks ?? re.total_add_backs ?? null;
        const recast_ebitda_val = re.recast_ebitda ?? re.recastEbitda ?? null;
        const recast_val_increase = re.recast_value_impact ?? re.valuationIncrease ?? re.valuation_increase ?? null;

        const freedom_score = fa.freedom_score ?? fa.freedomScore ?? null;
        const freedom_date = fa.freedom_date ?? fa.freedomDate ?? null;
        const revenue = pgA.p1_rev ?? pg.revenue ?? null;

        // IQ composite — only real scores contribute. The previous 55/60/50/45/70
        // placeholders were fabricated performance and are removed.
        const scoreInputs = [];
        if (pg.profit_score != null) scoreInputs.push(pg.profit_score);
        if (ops_score != null) scoreInputs.push(ops_score);
        if (freedom_score != null) scoreInputs.push(freedom_score);
        const derived_iq_score = scoreInputs.length > 0
          ? Math.round(scoreInputs.reduce((a, b) => a + b, 0) / scoreInputs.length)
          : null;

        const sev = (gap) => {
          if (gap == null) return null;
          if (gap > 500000) return 'significant';
          if (gap > 100000) return 'moderate';
          return 'small';
        };

        // ── SCHEMA-VALID payload ─────────────────────────────────────────────
        // dashboard_metrics numeric columns take scalars; the supporting detail
        // object belongs in the sibling *_details JSONB column. Writing the object
        // into the numeric column made PostgREST reject the entire statement — and
        // because the error was never read, the Journey promotion stored no
        // dashboard metrics at all. Same defect as guestSessionService.
        const metricsPayload = { profile_id, updated_at: now };

        // NUMERIC columns
        if (profit_gap_amount != null) metricsPayload.profit_gap = profit_gap_amount;
        if (value_gap_amount != null) metricsPayload.value_gap = value_gap_amount;
        if (tax_annual != null) metricsPayload.tax_gap = tax_annual;
        if (ops_score != null) metricsPayload.operations_gap = ops_score;
        if (recast_ebitda_val != null) metricsPayload.recast_ebitda = recast_ebitda_val;
        if (current_value != null) metricsPayload.enterprise_value = current_value;
        if (freedom_score != null) metricsPayload.freedom_score = freedom_score;
        if (derived_iq_score != null) metricsPayload.ciq_score = derived_iq_score;
        if (revenue != null) metricsPayload.revenue = revenue;

        // JSONB *_details columns
        if (profit_gap_amount != null) {
          metricsPayload.profit_gap_details = {
            gap_to_average: profit_gap_to_avg,
            gap_to_best: profit_gap_amount,
            current_margin,
            severity: sev(profit_gap_amount),
          };
        }
        if (value_gap_amount != null) {
          metricsPayload.value_gap_details = {
            current_value,
            potential_value,
            gap_amount: value_gap_amount,
            severity: sev(value_gap_amount),
          };
        }
        if (tax_annual != null) {
          metricsPayload.tax_gap_details = {
            annual_overpayment: tax_annual,
            ten_year_cost: tax_annual * 10,
            severity: sev(tax_annual),
          };
        }
        if (ops_score != null) {
          metricsPayload.operations_gap_details = {
            score: ops_score,
            monthly_value_of_time_freed,
            hourly_value_of_time_freed,
            monthly_take_home,
            hours_worked_per_week,
            hours_freed_per_week,
            severity: ops_score < 45 ? 'significant' : ops_score < 75 ? 'moderate' : 'small',
          };
        }
        if (recast_add_backs != null || recast_val_increase != null) {
          metricsPayload.recast_ebitda_gap_details = {
            add_backs: recast_add_backs,
            valuation_increase: recast_val_increase,
          };
        }
        if (freedom_score != null || freedom_date != null) {
          metricsPayload.freedom_gap_details = { score: freedom_score, freedom_date };
        }

        const { data: existing } = await sb.from('dashboard_metrics')
          .select('id')
          .eq('profile_id', profile_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { error: metricsWriteErr } = existing
          ? await sb.from('dashboard_metrics').update(metricsPayload).eq('id', existing.id)
          : await sb.from('dashboard_metrics').insert({ ...metricsPayload, created_at: now });

        // Phase 6B.2 — report.dashboard_ready was set unconditionally, so the
        // caller was told the dashboard was hydrated even when the write was
        // rejected. It now reflects the actual outcome.
        if (metricsWriteErr) {
          report.warnings.push(`METRICS_SYNC_FAILED: dashboard_metrics write rejected — ${metricsWriteErr.message}`);
          report.metrics_synced = false;
          report.metrics_error = metricsWriteErr.message;
        } else {
          report.metrics_synced = true;
          for (const key of Object.keys(aa)) {
            if (report[key]) report[key].dashboard_ready = true;
          }
        }

        // ── 5. Write business_metric_snapshots entry ───────────────────────────
        try {
          const snapshotPayload = {
            profile_id,
            snapshot_date: now.split('T')[0],
            overall_impact_score: derived_iq_score,
            profit_gap_amount,
            value_gap_amount,
            tax_gap_annual: tax_annual,
            operations_score: ops_score,
            annual_revenue: pgA.p1_rev || pg.revenue || null,
            created_at: now,
            updated_at: now,
          };
          // Clean absent values only — a legitimate 0 must not become NULL.
          Object.keys(snapshotPayload).forEach(k => {
            if (snapshotPayload[k] === null || snapshotPayload[k] === undefined) delete snapshotPayload[k];
          });
          if (Object.keys(snapshotPayload).length > 3) {
            await sb.from('business_metric_snapshots').upsert(snapshotPayload, { onConflict: 'profile_id,snapshot_date' });
          }
        } catch (snapErr) {
          report.warnings.push('snapshot write failed: ' + snapErr.message);
        }

      } catch (metricsErr) {
        report.metrics_synced = false;
        report.metrics_error = metricsErr.message;
        report.warnings.push('METRICS_SYNC_FAILED: ' + metricsErr.message);
      }
    }

    return Response.json({ success: true, report });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});