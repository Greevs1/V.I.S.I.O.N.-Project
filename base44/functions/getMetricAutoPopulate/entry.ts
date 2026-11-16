/**
 * getMetricAutoPopulate — Returns best available financial metrics
 * from the data priority chain for auto-populating assessment fields.
 *
 * Priority order:
 *   1. Most recent verified extracted_fields (from document extraction)
 *   2. profile_financials table
 *   3. business_assessments table
 *   4. dashboard_metrics table
 *   5. Fallback null (manual entry)
 *
 * Returns: { agi, monthly_take_home, ebitda, revenue, net_profit, sources }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';

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

    // Resolve profile
    const { data: profile } = await sb
      .from('profiles')
      .select('id, primary_business_id, email')
      .eq('email', user.email)
      .maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const profileId = profile.id;
    // Phase 6.9B — canonical resolution. Was `body.business_id || body.active_business_id
    // || profile.primary_business_id`, which silently used the primary business for a
    // multi-business account that supplied no explicit context.
    const { businessId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, body.business_id || body.active_business_id, 'getMetricAutoPopulate'
    );
    if (bizDenial) return bizDenial;

    // ── Phase 6.6 — BUSINESS SCOPE GUARD ─────────────────────────────────────
    // The service-role client bypasses RLS, and this body business_id scoped
    // reads of extracted_fields, business_assessments and dashboard_metrics —
    // so any authenticated caller could pass another tenant's business_id and
    // read their financial metrics. The caller's own primary business is
    // definitionally authorized; every other business must pass the same
    // ownership rule RLS enforces (owner / assigned advisor / team member).
    if (businessId !== profile.primary_business_id) {
      try {
        await validateBusinessScope(sb, businessId, profileId);
      } catch (scopeErr) {
        console.error('[getMetricAutoPopulate] business scope denied:', scopeErr.message);
        return Response.json({ error: 'Forbidden: no access to that business' }, { status: 403 });
      }
    }

    const sources = {};

    let agi = null;
    let monthlyTakeHome = null;
    let ebitda = null;
    let revenue = null;
    let netProfit = null;

    // ── Priority 1: extracted_fields (from document extraction) ──
    // Business-scoped: when business_id is available, read only this business's
    // extracted fields. Prevents cross-business metric contamination.
    let extractedQuery = sb
      .from('extracted_fields')
      .select('field_name, field_value, numeric_value, review_status, created_at, business_id, document_id')
      .in('review_status', ['accepted', 'pending_review'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (businessId) {
      extractedQuery = extractedQuery.eq('business_id', businessId);
    } else {
      extractedQuery = extractedQuery.eq('profile_id', profileId);
    }
    const { data: extracted } = await extractedQuery;

    // Parse currency-formatted strings: "$1,250,000" → 1250000
    // Also prefer numeric_value column when populated by the extraction pipeline.
    const parseCurrency = (raw) => {
      if (raw == null) return null;
      if (typeof raw === 'number') return raw;
      const cleaned = String(raw).replace(/[$,\s]/g, '').replace(/[^\d.\-]/g, '');
      const val = parseFloat(cleaned);
      return isNaN(val) ? null : val;
    };

    // Each winning field keeps the row it came from, so an auto-populated value
    // can name the document behind it rather than only its category.
    const extractedByField = {};
    (extracted || []).forEach(ef => {
      if (!extractedByField[ef.field_name]) {
        // Prefer numeric_value if the extraction pipeline populated it
        const val = ef.numeric_value != null ? parseCurrency(ef.numeric_value) : parseCurrency(ef.field_value);
        if (val != null && val > 0) {
          extractedByField[ef.field_name] = {
            value: val,
            document_id: ef.document_id || null,
            captured_at: ef.created_at || null,
            // Whether this figure is GOVERNED (accepted/corrected by a reviewer)
            // or still merely extracted. A consumer must be able to tell the two
            // apart: pending data may pre-populate an editable form, but it is not
            // confirmed truth.
            review_status: ef.review_status || null,
          };
        }
      }
    });

    // Map common field names
    const findExtractedRow = (names) => {
      for (const n of names) {
        if (extractedByField[n]) return extractedByField[n];
      }
      return null;
    };
    const findExtracted = (names) => findExtractedRow(names)?.value ?? null;

    const extractedRevenueRow = findExtractedRow(['annual_revenue', 'total_revenue', 'gross_revenue', 'revenue']);
    const extractedNetProfitRow = findExtractedRow(['net_profit', 'net_income', 'profit']);
    const extractedAgiRow = findExtractedRow(['adjusted_gross_income', 'agi', 'total_income', 'taxable_income']);
    const extractedEbitdaRow = findExtractedRow(['reported_ebitda', 'ebitda', 'recast_ebitda', 'normalized_ebitda', 'adjusted_ebitda', 'operating_income']);
    const extractedMonthlyTakeHomeRow = findExtractedRow(['monthly_take_home', 'monthly_income', 'owner_compensation', 'owner_draw', 'monthly_distribution']);

    // The documents behind those values, in one lookup, so a source can name the
    // document the owner actually uploaded instead of only a category.
    const extractedDocumentIds = [...new Set(
      [extractedRevenueRow, extractedNetProfitRow, extractedAgiRow, extractedEbitdaRow, extractedMonthlyTakeHomeRow]
        .map(r => r?.document_id)
        .filter(Boolean)
    )];
    const extractedDocumentMeta: Record<string, any> = {};
    if (extractedDocumentIds.length > 0) {
      const { data: sourceDocs } = await sb
        .from('documents')
        .select('id, name, document_type, year')
        .in('id', extractedDocumentIds);
      (sourceDocs || []).forEach(d => { extractedDocumentMeta[d.id] = d; });
    }

    /**
     * A source document is reported ONLY when the winning field row really
     * carries a document_id. Null means "no document behind this figure" — never
     * a guess, and never a filename inferred from the document type.
     * `review_status` travels with it so a surface can distinguish a GOVERNED
     * value from one still awaiting review.
     */
    const sourceDocument = (row) => {
      if (!row?.document_id) return null;
      const d = extractedDocumentMeta[row.document_id];
      return {
        document_id: row.document_id,
        name: d?.name || null,
        document_type: d?.document_type || null,
        year: d?.year || null,
        captured_at: row.captured_at || null,
        review_status: row.review_status || null,
      };
    };

    if (extractedAgiRow) {
      agi = extractedAgiRow.value;
      sources.agi = 'extracted_fields';
      sources.agi_document = sourceDocument(extractedAgiRow);
    }
    if (extractedRevenueRow) {
      revenue = extractedRevenueRow.value;
      sources.revenue = 'extracted_fields';
      sources.revenue_document = sourceDocument(extractedRevenueRow);
    }
    if (extractedNetProfitRow) {
      netProfit = extractedNetProfitRow.value;
      sources.net_profit = 'extracted_fields';
      sources.net_profit_document = sourceDocument(extractedNetProfitRow);
    }
    if (extractedEbitdaRow) {
      ebitda = extractedEbitdaRow.value;
      sources.ebitda = 'extracted_fields';
      sources.ebitda_document = sourceDocument(extractedEbitdaRow);
    }
    if (extractedMonthlyTakeHomeRow) {
      monthlyTakeHome = extractedMonthlyTakeHomeRow.value;
      sources.monthly_take_home = 'extracted_fields';
      sources.monthly_take_home_document = sourceDocument(extractedMonthlyTakeHomeRow);
    }

    // ── Priority 2: profile_financials ──
    const { data: pf } = await sb
      .from('profile_financials')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (pf) {
      if (!agi && pf.adjusted_gross_income) {
        agi = pf.adjusted_gross_income;
        sources.agi = 'profile_financials';
      }
      if (!agi && pf.annual_agi) {
        agi = pf.annual_agi;
        sources.agi = 'profile_financials';
      }
      if (!revenue && pf.annual_revenue) {
        revenue = pf.annual_revenue;
        sources.revenue = 'profile_financials';
      }
      if (!netProfit && pf.net_profit) {
        netProfit = pf.net_profit;
        sources.net_profit = 'profile_financials';
      }
      if (!ebitda && pf.ebitda) {
        ebitda = pf.ebitda;
        sources.ebitda = 'profile_financials';
      }
      if (!monthlyTakeHome && pf.monthly_take_home) {
        monthlyTakeHome = pf.monthly_take_home;
        sources.monthly_take_home = 'profile_financials';
      }
    }

    // ── Priority 3: business_assessments ──
    // Business-scoped: when business_id is available, read only this business's
    // assessments. Prevents cross-business assessment prefill contamination.
    let assessmentsQuery = sb
      .from('business_assessments')
      .select('assessment_type, answers, results, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20);
    if (businessId) {
      assessmentsQuery = assessmentsQuery.eq('business_id', businessId);
    } else {
      assessmentsQuery = assessmentsQuery.eq('profile_id', profileId);
    }
    const { data: assessments } = await assessmentsQuery;

    (assessments || []).forEach(a => {
      const ans = a.answers || {};
      const res = a.results || {};
      if (!agi && (ans.t3_agi || res.t3_agi)) {
        agi = ans.t3_agi || res.t3_agi;
        if (!sources.agi) sources.agi = 'prior_assessment';
      }
      if (!ebitda && (ans.v2_ebitda || res.ebitda || ans.rc_ebitda)) {
        ebitda = ans.v2_ebitda || res.ebitda || ans.rc_ebitda;
        if (!sources.ebitda) sources.ebitda = 'prior_assessment';
      }
      if (!revenue && ans.p1_rev) {
        revenue = ans.p1_rev;
        if (!sources.revenue) sources.revenue = 'prior_assessment';
      }
      if (!monthlyTakeHome && (ans.o4_takehome || ans.o4_takehome > 0)) {
        monthlyTakeHome = ans.o4_takehome;
        if (!sources.monthly_take_home) sources.monthly_take_home = 'prior_assessment';
      }
    });

    // ── Priority 4: dashboard_metrics ──
    // Business-scoped: when business_id is available, read only this business's
    // dashboard metrics. Prevents cross-business metric contamination.
    if (!revenue || !ebitda) {
      let dmQuery = sb
        .from('dashboard_metrics')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (businessId) {
        dmQuery = dmQuery.eq('business_id', businessId);
      } else {
        dmQuery = dmQuery.eq('profile_id', profileId);
      }
      const { data: dm } = await dmQuery.maybeSingle();

      if (dm) {
        if (!revenue && dm.revenue) {
          revenue = dm.revenue;
          if (!sources.revenue) sources.revenue = 'dashboard_metrics';
        }
        if (!ebitda && dm.recast_ebitda) {
          ebitda = dm.recast_ebitda;
          if (!sources.ebitda) sources.ebitda = 'dashboard_metrics';
        }
        if (!netProfit && dm.net_profit) {
          netProfit = dm.net_profit;
          if (!sources.net_profit) sources.net_profit = 'dashboard_metrics';
        }
      }
    }

    // ── Derive monthly take-home from net profit / 12 if needed ──
    if (!monthlyTakeHome && netProfit) {
      monthlyTakeHome = Math.round(netProfit / 12);
      if (!sources.monthly_take_home) sources.monthly_take_home = `${sources.net_profit || 'net_profit'} / 12`;
    }
    if (!monthlyTakeHome && revenue && netProfit) {
      monthlyTakeHome = Math.round(netProfit / 12);
    }

    // ── Derive EBITDA from revenue × margin if needed ──
    if (!ebitda && revenue && typeof netProfit === 'number' && revenue > 0) {
      ebitda = Math.round(netProfit);
      if (!sources.ebitda) sources.ebitda = 'derived_from_revenue';
    }

    // ── Derive AGI from net profit if needed ──
    if (!agi && netProfit) {
      agi = Math.round(netProfit);
      if (!sources.agi) sources.agi = 'derived_from_net_profit';
    }

    // Always pass through revenue/netProfit from step 1 if the others are missing
    // This makes the assessment flow smooth — ProfitGap fills revenue/margin, then
    // downstream steps auto-populate from that.

    return Response.json({
      agi,
      monthly_take_home: monthlyTakeHome,
      ebitda,
      revenue,
      net_profit: netProfit,
      sources,
    });

  } catch (err) {
    console.error('[getMetricAutoPopulate] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});