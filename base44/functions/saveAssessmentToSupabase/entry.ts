/**
 * saveAssessmentToSupabase
 *
 * Persists each completed V.I.S.I.O.N. Platform gap assessment to Supabase.
 * Core write: business_assessments (upsert by profile_id + assessment_type)
 * Secondary writes: assessment_sessions, assessment_answers, assessment_calculations,
 *                   gap_analyses, profile_financials, dashboard_metrics, business_metric_snapshots
 *
 * Rules enforced:
 *  - Never invent numbers — all values come from answers/results/state passed in.
 *  - Missing inputs captured in missing_data field.
 *  - Plain-English owner explanation generated per assessment type.
 *  - Sensitive data stays in Supabase only (never stored in Base44 entities).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || isNaN(n)) return null;
  return Math.round(n);
}

// CRITICAL: Zero is a valid value, not "missing". Return '$0' for zero
// instead of null. Previously, fmtMoney(0) = null, which caused display
// strings to show fallback messages for legitimate zero results.
function fmtMoney(n) {
  if (n == null || isNaN(n)) return null;
  if (n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function severity(dollarGap) {
  if (!dollarGap) return 'small';
  if (dollarGap > 500_000) return 'significant';
  if (dollarGap > 100_000) return 'moderate';
  return 'small';
}

function riskLevel(score) {
  if (score == null) return null;
  if (score >= 75) return 'low';
  if (score >= 45) return 'medium';
  return 'high';
}

function opportunityLevel(dollarGap) {
  if (!dollarGap) return 'low';
  if (dollarGap > 500_000) return 'high';
  if (dollarGap > 100_000) return 'medium';
  return 'low';
}

// ─── Plain-English owner explanations ─────────────────────────────────────────

function ownerExplanation(type, results, answers, state) {
  const rev = state?.p1_rev;
  const industry = state?.industry || 'your industry';

  switch (type) {
    case 'profit_gap': {
      const gap = results?.profit_gap;
      const myM = answers?.p1_mymargin ?? state?.p1_mymargin;
      const topM = answers?.p1_top ?? state?.p1_top;
      if (!rev || myM == null) return 'Complete the revenue and margin fields to see your Profit Gap.';
      if (!gap) return `Your current margin is already strong relative to ${industry} benchmarks.`;
      return `Your current profit margin is ${myM}%. The top performers in ${industry} operate at around ${topM}%. Closing that gap on your $${(rev/1_000_000).toFixed(1)}M revenue could add ${fmtMoney(gap)} in annual profit — without growing revenue at all. This is money already in your business waiting to be unlocked.`;
    }
    case 'value_gap': {
      const curr = results?.current_value;
      const pot = results?.potential_value;
      const gap = results?.value_gap;
      if (curr == null) return 'Enter your EBITDA and current valuation multiple to calculate your Value Gap.';
      return `Right now your business is worth approximately ${fmtMoney(curr)}. By improving your EBITDA multiple — through stronger systems, recurring revenue, and reduced owner dependency — you could reach a potential value of ${fmtMoney(pot)}. That's a ${fmtMoney(gap)} Value Gap sitting on the table.`;
    }
    case 'recast_ebitda': {
      const addbacks = results?.total_addbacks;
      const recast = results?.recast_ebitda;
      const impact = results?.recast_value_impact;
      if (addbacks == null) return 'Add your owner add-backs to see how Recast EBITDA increases your business value.';
      return `After adding back ${fmtMoney(addbacks)} in owner-related expenses, your normalized EBITDA is ${fmtMoney(recast)}. This recasting increases what a buyer would pay for your business by approximately ${fmtMoney(impact)}.`;
    }
    case 'tax_gap': {
      const annual = results?.t3_annual_gap;
      const strategies = results?.t3_strategies || [];
      if (annual == null) return 'Enter your income details to calculate your Tax Gap.';
      if (annual === 0) return `Based on your answers, your current tax strategies appear well-optimized — no significant overpayment was identified. Ongoing review is recommended as your income grows.`;
      return `Based on your answers, you may be overpaying in taxes by approximately ${fmtMoney(annual)} per year. Over 10 years, that compounds to a significant amount. The top opportunities identified are: ${strategies.slice(0, 3).join(', ')}. These are legal, IRS-approved strategies your CPA may not have discussed yet.`;
    }
    case 'operations_gap': {
      const score = results?.operations_score;
      if (score == null) return 'Score your operations to see where your business is losing efficiency.';
      const descriptor = score >= 75 ? 'well-systematized' : score >= 45 ? 'moderately dependent on you' : 'heavily owner-dependent';
      return `Your operations score is ${score}/100, meaning your business is currently ${descriptor}. Businesses that run without the owner command higher multiples, retain better talent, and reduce your personal stress. Improving this score directly increases enterprise value.`;
    }
    case 'freedom_assessment': {
      const freedomScore = results?.freedom_score;
      const freedomDate = results?.freedom_date;
      if (freedomScore == null) return 'Complete the Freedom Assessment to see your financial independence timeline.';
      return `Your Freedom Score is ${freedomScore}/100. Based on your current trajectory, your estimated financial independence date is ${freedomDate || 'TBD'}. This reflects your business value, savings rate, and retirement income goals. Small improvements across profit, value, and tax gaps can move this date significantly earlier.`;
    }
    case 'cash_flow_gap': {
      const gap = results?.cash_flow_gap;
      if (!gap) return 'Provide cash flow details to calculate your Cash Flow Gap.';
      return `Your cash flow analysis shows a gap of ${fmtMoney(gap)}. Optimizing billing cycles, receivables, and expense timing can close this gap without requiring additional revenue.`;
    }
    case 'protections_gap': {
      const score = results?.protection_score;
      if (score == null) return 'Complete the Protections assessment to identify your coverage gaps.';
      return `Your Protections Score is ${score}/100. Gaps in business continuity, key-person coverage, or entity structure can put years of wealth-building at risk. Addressing these protects both your business value and personal financial security.`;
    }
    case 'wealth_gap': {
      const gap = results?.wealth_gap;
      const target = results?.target_wealth;
      if (!gap) return 'Enter your wealth and retirement goals to calculate your Wealth Gap.';
      return `Your target wealth at retirement is ${fmtMoney(target)}. Your current trajectory leaves a gap of ${fmtMoney(gap)}. Maximizing your business value and tax efficiency are the fastest levers to close this gap.`;
    }
    case 'full_business_assessment': {
      return `This comprehensive assessment covers all seven V.I.S.I.O.N. Platform gaps. Review each section for your personalized action plan and prioritized next steps.`;
    }
    default:
      return 'Assessment completed. Review your results with your advisor.';
  }
}

// ─── Key findings per assessment type ─────────────────────────────────────────

function keyFindings(type, results, answers, state) {
  const findings = [];

  if (type === 'profit_gap') {
    const myM = answers?.p1_mymargin ?? state?.p1_mymargin;
    const avgM = answers?.p1_avg ?? state?.p1_avg;
    const topM = answers?.p1_top ?? state?.p1_top;
    if (myM != null) findings.push(`Current profit margin: ${myM}%`);
    if (avgM != null) findings.push(`Industry average margin: ${avgM}%`);
    if (topM != null) findings.push(`Top-quartile margin: ${topM}%`);
    // Use != null check, not truthy check — zero is a valid finding.
    if (results?.profit_gap != null) findings.push(`Annual profit gap to top: ${fmtMoney(results.profit_gap)}`);
  }

  if (type === 'value_gap') {
    if (results?.current_value != null) findings.push(`Current estimated value: ${fmtMoney(results.current_value)}`);
    if (results?.potential_value != null) findings.push(`Potential value: ${fmtMoney(results.potential_value)}`);
    if (answers?.v2_mult ?? state?.v2_mult) findings.push(`Current multiple: ${answers?.v2_mult ?? state?.v2_mult}x`);
    if (results?.potential_multiple) findings.push(`Potential multiple: ${results.potential_multiple.toFixed(1)}x`);
  }

  if (type === 'recast_ebitda') {
    if (results?.total_addbacks != null) findings.push(`Total add-backs identified: ${fmtMoney(results.total_addbacks)}`);
    if (results?.recast_ebitda != null) findings.push(`Recast EBITDA: ${fmtMoney(results.recast_ebitda)}`);
    if (results?.recast_value_impact != null) findings.push(`Valuation increase from recast: ${fmtMoney(results.recast_value_impact)}`);
  }

  if (type === 'tax_gap') {
    // Use != null check, not truthy check — zero is a valid finding.
    if (results?.t3_annual_gap != null) findings.push(`Estimated annual tax overpayment: ${fmtMoney(results.t3_annual_gap)}`);
    const strats = results?.t3_strategies || [];
    if (strats.length > 0) findings.push(`Strategies identified: ${strats.length} (${strats.slice(0, 2).join(', ')}${strats.length > 2 ? '...' : ''})`);
    if (answers?.t3_entity ?? state?.t3_entity) findings.push(`Current entity structure: ${answers?.t3_entity ?? state?.t3_entity}`);
  }

  if (type === 'operations_gap') {
    if (results?.operations_score != null) findings.push(`Operations score: ${results.operations_score}/100`);
    if (answers?.o4_hrs ?? state?.o4_hrs) findings.push(`Owner hours per week: ${answers?.o4_hrs ?? state?.o4_hrs}`);
  }

  if (type === 'freedom_assessment') {
    if (results?.freedom_score != null) findings.push(`Freedom score: ${results.freedom_score}/100`);
    if (results?.freedom_date) findings.push(`Estimated freedom date: ${results.freedom_date}`);
    if (results?.optimized_years_to_freedom != null) findings.push(`Years to freedom (optimized): ${results.optimized_years_to_freedom}`);
  }

  return findings;
}

// ─── Recommendations per assessment type ──────────────────────────────────────

function recommendations(type, results, answers, state) {
  switch (type) {
    case 'profit_gap':
      return ['Review top-line pricing strategy', 'Audit COGS and reduce waste', 'Benchmark compensation against industry peers', 'Explore value-based pricing models'];
    case 'value_gap':
      return ['Reduce owner dependency to improve multiple', 'Build recurring revenue streams', 'Improve contract and customer concentration metrics', 'Document and systematize key processes'];
    case 'recast_ebitda':
      return ['Work with CPA to document all legitimate add-backs', 'Prepare a quality-of-earnings analysis', 'Separate personal and business expenses clearly', 'Normalize one-time or non-recurring items'];
    case 'tax_gap': {
      const strats = results?.t3_strategies || [];
      return strats.length > 0 ? strats.map(s => `Implement: ${s}`) : ['Consult with a tax strategist', 'Review entity structure optimization', 'Explore retirement plan contributions'];
    }
    case 'operations_gap':
      return ['Document top 5 processes as SOPs', 'Identify tasks only you can do vs. those that can be delegated', 'Implement an accountability chart', 'Invest in technology to reduce manual work'];
    case 'freedom_assessment':
      return ['Close the largest dollar-value gap first', 'Maximize retirement contributions', 'Accelerate business value growth', 'Build a 90-day unplugged plan'];
    case 'cash_flow_gap':
      return ['Tighten accounts receivable collections', 'Review payment terms with vendors', 'Establish a cash reserve target', 'Implement rolling 13-week cash flow forecasting'];
    case 'protections_gap':
      return ['Review key-person insurance coverage', 'Audit buy-sell agreements', 'Ensure entity structure limits liability exposure', 'Update business continuity plan'];
    case 'wealth_gap':
      return ['Maximize business sale readiness', 'Diversify outside the business', 'Optimize tax-advantaged retirement accounts', 'Model multiple exit scenarios'];
    case 'full_business_assessment':
      return ['Complete all 7 gap assessments', 'Prioritize gaps by dollar impact', 'Meet with your advisor to build a V.I.S.I.O.N. Strategic Plan', 'Set 90-day milestones for the highest-leverage opportunities'];
    default:
      return ['Review findings with your advisor'];
  }
}

// ─── Detect missing data ───────────────────────────────────────────────────────

function detectMissingData(type, answers, state) {
  const missing = [];
  const rev = state?.p1_rev;
  const margin = state?.p1_mymargin;
  const ebitda = state?.v2_ebitda;

  if (!rev || rev === 0) missing.push('Annual revenue not provided');
  if (margin == null || margin === 0) missing.push('Current profit margin not provided');

  if (type === 'value_gap' && (!ebitda || ebitda === 0)) missing.push('EBITDA not provided — value estimate may be inaccurate');
  if (type === 'tax_gap' && (!state?.t3_agi || state?.t3_agi === 0)) missing.push('AGI not provided — tax gap calculation requires income data');
  if (type === 'operations_gap') {
    const scores = state?.o4_scores || [];
    if (scores.length < 6) missing.push('Not all operations dimensions scored');
  }
  if (type === 'freedom_assessment' && (!state?.f_net_worth || state?.f_net_worth === 0)) missing.push('Net worth not provided — wealth gap estimate may be understated');

  return missing;
}

// ─── Next best actions ────────────────────────────────────────────────────────

function nextBestActions(type, results) {
  switch (type) {
    case 'profit_gap':
      return ['Schedule a profit review with your advisor', 'Pull a P&L breakdown by product/service line', 'Identify top 3 expense categories to reduce'];
    case 'value_gap':
      return ['Request a business valuation baseline', 'Identify 1 initiative to reduce owner dependency', 'Review your current EBITDA multiple drivers'];
    case 'recast_ebitda':
      return ['Provide prior 3-year P&Ls for full recast analysis', 'Identify all owner-related expenses for add-back review', 'Schedule a quality-of-earnings call with your advisor'];
    case 'tax_gap':
      return ['Share tax returns with your advisor for strategy review', `Start with ${results?.t3_strategies?.[0] || 'entity restructuring'} — the highest-value strategy identified`, 'Schedule a tax planning session before year-end'];
    case 'operations_gap':
      return ['Identify the 3 processes most dependent on you personally', 'Start documenting one SOP this week', 'Score your team against the accountability chart'];
    case 'freedom_assessment':
      return ['Set your target freedom date', 'Calculate your wealth gap using the Wealth Gap tool', 'Identify the single biggest lever to move your freedom date earlier'];
    case 'cash_flow_gap':
      return ['Run a 13-week cash flow forecast', 'Review AR aging report', 'Identify the largest cash timing mismatches'];
    case 'protections_gap':
      return ['Review current insurance policies', 'Audit buy-sell agreement with your attorney', 'Check entity liability protections are current'];
    case 'wealth_gap':
      return ['Model your business exit scenarios', 'Maximize retirement account contributions this year', 'Review your personal investment allocation'];
    case 'full_business_assessment':
      return ['Complete any incomplete gap assessments', 'Review your V.I.S.I.O.N. Strategic Roadmap with your advisor', 'Prioritize top 3 opportunities by dollar impact'];
    default:
      return ['Review your results with your advisor'];
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { assessmentType, answers = {}, results = {}, state = {}, activeBusinessId = null } = body;

    if (!assessmentType) return Response.json({ error: 'assessmentType is required' }, { status: 400 });

    // ── 1. Resolve profile ────────────────────────────────────────────────────
    console.log('[saveAssessment] called for user:', user.email, '| assessmentType:', assessmentType);

    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('id, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();

    if (profileErr) console.error('[saveAssessment] profile fetch error:', profileErr.message, '| url used:', SUPABASE_URL);
    if (!profile) {
      console.error('[saveAssessment] profile not found for email:', user.email, '| profileErr:', profileErr?.message || 'none');
      return Response.json({ error: 'Profile not found', email: user.email }, { status: 404 });
    }
    console.log('[saveAssessment] profile resolved:', profile.id);

    const profileId = profile.id;

    // ── 1b. Resolve business_id — prefer explicit activeBusinessId from frontend ──
    // Business Context Engine guarantee: frontend sends correct active business.
    // Only run the expensive lookup when activeBusinessId is absent.
    // Phase 6.9B — canonical resolution. Was `activeBusinessId || profile.primary_business_id
    // || null`, which silently persisted the assessment against the primary business for a
    // multi-business account that supplied no explicit context.
    const { businessId: resolvedBusinessId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, activeBusinessId, 'saveAssessmentToSupabase'
    );
    if (bizDenial) return bizDenial;
    let businessId = resolvedBusinessId;
    console.log('[saveAssessment] Step 1b - resolved businessId:', businessId, '| from activeBusinessId:', activeBusinessId);

    if (!businessId) {
      console.log('[saveAssessment] Step 1b - no businessId, querying business_entities table...');
      
      // Try to find an existing business_entities linked to this profile
      const { data: businessEntities, error: bizFetchErr } = await sb
        .from('business_entities')
        .select('id')
        .eq('profile_id', profileId)
        .limit(1);

      if (bizFetchErr) {
        console.error('[saveAssessment] Step 1b - business_entities fetch error:', bizFetchErr.message);
      } else {
        console.log('[saveAssessment] Step 1b - business_entities query result:', businessEntities?.length || 0, 'rows');
      }

      if (businessEntities && businessEntities.length > 0) {
        businessId = businessEntities[0].id;
        console.log('[saveAssessment] Step 1b - business found via business_entities table:', businessId);

        // Update profile to link this business
        const { error: updErr } = await sb.from('profiles').update({ primary_business_id: businessId }).eq('id', profileId);
        if (updErr) {
          console.error('[saveAssessment] Step 1b - failed to update profile.primary_business_id:', updErr.message);
        } else {
          console.log('[saveAssessment] Step 1b - profile.primary_business_id updated to:', businessId);
        }
      } else {
        console.log('[saveAssessment] Step 1b - no business_entities found, creating new record...');
        
        // Create a default "My Business" record in business_entities
        const { data: newBiz, error: bizCreateErr } = await sb
          .from('business_entities')
          .insert({
            profile_id: profileId,
            business_name: 'My Business',
            current_stage: 'onboarding',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (bizCreateErr) {
          console.error('[saveAssessment] Step 1b - FAILED to create business_entities:', bizCreateErr.message, '| details:', bizCreateErr.details || 'none', '| hint:', bizCreateErr.hint || 'none');
        } else {
          businessId = newBiz?.id || null;
          console.log('[saveAssessment] Step 1b - business_entities created successfully:', businessId);

          // Link back to profile using primary_business_id
          if (businessId) {
            const { error: updateErr } = await sb.from('profiles').update({ primary_business_id: businessId }).eq('id', profileId);
            if (updateErr) {
              console.error('[saveAssessment] Step 1b - FAILED to update profile.primary_business_id:', updateErr.message);
            } else {
              console.log('[saveAssessment] Step 1b - profile.primary_business_id updated:', businessId);
            }
          }
        }
      }
    }

    console.log('[saveAssessment] Step 1b - FINAL businessId resolved:', businessId);

    // ── 1c. Tenant enforcement (Phase 6B) ─────────────────────────────────────
    // The frontend-supplied activeBusinessId is NOT trusted on its own. Verify the
    // authenticated profile is actually authorized for this business before any
    // business-owned write. A guard nobody calls is not tenant protection.
    if (businessId) {
      try {
        await validateBusinessScope(sb, businessId, profileId);
      } catch (scopeErr) {
        console.error('[saveAssessment] business scope denied:', scopeErr.message);
        return Response.json(
          { error: scopeErr.message, reason: 'business_scope_denied' },
          { status: 403 },
        );
      }
    }

    // ── 2. Upsert assessment session (one per profile+type, not one per save) ──
    // Deduplicate: reuse the existing session for this assessment type if it exists.
    // Scope by business_id when available — prevents cross-business session theft.
    // Without this, completing tax_gap for Business B would reuse Business A's session
    // and update its business_id, causing Business A to lose its assessment completion.
    let sessionQuery = sb.from('assessment_sessions')
      .select('id')
      .eq('profile_id', profileId)
      .eq('assessment_type', assessmentType);
    if (businessId) {
      sessionQuery = sessionQuery.eq('business_id', businessId);
    }
    const { data: existingSession } = await sessionQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let sessionId = existingSession?.id || null;

    if (sessionId) {
      // Update existing session timestamp + business_id (backfill for sessions
      // created before business_id was populated in the save flow)
      await sb.from('assessment_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString(), ...(businessId ? { business_id: businessId } : {}) })
        .eq('id', sessionId);
      console.log('[saveAssessment] assessment_sessions reused:', sessionId);
    } else {
      const { data: session, error: sessionErr } = await sb.from('assessment_sessions').insert({
        profile_id: profileId,
        business_id: businessId || null,
        assessment_type: assessmentType,
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }).select('id').single();
      if (sessionErr) console.error('[saveAssessment] assessment_sessions insert error:', sessionErr.message);
      else console.log('[saveAssessment] assessment_sessions created:', session?.id);
      sessionId = session?.id || null;
    }

    // ── 3. Save raw answers ───────────────────────────────────────────────────
    if (sessionId && Object.keys(answers).length > 0) {
      const answerRows = Object.entries(answers).map(([key, val]) => ({
        session_id: sessionId,
        profile_id: profileId,
        assessment_type: assessmentType,
        question_key: key,
        answer_value: String(val),
        answer_source: 'user_entered',
      }));
      await sb.from('assessment_answers').insert(answerRows);
    }

    // ── 4. Save calculation detail ────────────────────────────────────────────
    if (sessionId) {
      // CRITICAL: Explicitly set created_at so loadAssessmentResults can order
      // by created_at DESC deterministically. Without this, if the DB column
      // has no DEFAULT, created_at is NULL and ordering is non-deterministic —
      // meaning RUN A's stale calculation could be selected over RUN B's.
      const calcRow = {
        session_id: sessionId,
        profile_id: profileId,
        assessment_type: assessmentType,
        calculation_name: `${assessmentType}_results`,
        input_json: answers,
        result_json: results,
        created_at: new Date().toISOString(),
      };
      const { error: calcErr } = await sb.from('assessment_calculations').insert(calcRow);
      if (calcErr) console.error('[saveAssessment] assessment_calculations insert error:', calcErr.message);
      else console.log('[saveAssessment] assessment_calculations inserted for session:', sessionId, '| created_at:', calcRow.created_at);
    }

    // ── 5. Derive core metrics for business_assessments ───────────────────────
    const missing = detectMissingData(assessmentType, answers, state);

    // Score — use whatever score the calculation produced, never invented
    const scoreMap = {
      profit_gap: results?.profit_score ?? results?.profitScore,
      value_gap: null,
      recast_ebitda: null,
      tax_gap: null,
      operations_gap: results?.operations_score,
      freedom_assessment: results?.freedom_score,
      cash_flow_gap: results?.cash_flow_score,
      protections_gap: results?.protection_score,
      wealth_gap: results?.wealth_score,
      full_business_assessment: results?.ciq_score,
    };
    const score = scoreMap[assessmentType] ?? null;

    // Opportunity value — use real calculated numbers only
    // VALIDATION: Explicitly map frontend result keys to backend field names
    // CRITICAL: Use ?? (nullish coalescing) NOT || (logical OR).
    // || skips 0, so a legitimate zero result would fall through to undefined
    // and fmt(undefined) = null — meaning zero can NEVER replace a non-zero value.
    // ?? only skips null/undefined, preserving 0 as a valid result.
    const oppValueMap = {
      profit_gap: results?.gapToBest ?? results?.gap_to_best ?? results?.profit_gap,
      value_gap: results?.valueGap ?? results?.value_gap ?? results?.value_gap_amount,
      recast_ebitda: results?.recast_value_impact,
      tax_gap: results?.t3_annual_gap ?? results?.tax_gap_annual,
      operations_gap: null,
      freedom_assessment: null,
      cash_flow_gap: results?.cash_flow_gap,
      protections_gap: null,
      wealth_gap: results?.wealth_gap,
      full_business_assessment: null,
    };
    const oppValue = fmt(oppValueMap[assessmentType]);

    const baRow = {
      profile_id: profileId,
      business_id: businessId,
      assessment_session_id: sessionId,
      assessment_type: assessmentType,
      status: 'completed',
      score: score != null ? Math.round(score) : null,
      risk_level: riskLevel(score),
      opportunity_level: opportunityLevel(oppValue),
      estimated_opportunity_value: oppValue,
      summary: `${assessmentType.replace(/_/g, ' ')} completed for ${state?.industry || 'business'} on ${new Date().toLocaleDateString()}`,
      owner_friendly_explanation: ownerExplanation(assessmentType, results, answers, state),
      advisor_summary: `Assessment type: ${assessmentType}. Score: ${score ?? 'N/A'}. Opportunity value: ${fmtMoney(oppValue) ?? 'N/A'}. Missing data: ${missing.length > 0 ? missing.join('; ') : 'none'}.`,
      missing_data: missing.length > 0 ? missing : null,
      key_findings: keyFindings(assessmentType, results, answers, state),
      recommendations: recommendations(assessmentType, results, answers, state),
      next_best_actions: nextBestActions(assessmentType, results),
      data_confidence_score: missing.length === 0 ? 95 : missing.length === 1 ? 75 : 50,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    // ── 6. Upsert business_assessments (business-scoped) ──────────────────────
    // Each business gets its own record per assessment type.
    // Lookup by (profile_id, business_id, assessment_type) — not just
    // (profile_id, assessment_type) — so Business B doesn't overwrite Business A.
    let existingBAQuery = sb.from('business_assessments')
      .select('id')
      .eq('profile_id', profileId)
      .eq('assessment_type', assessmentType);
    if (businessId) {
      existingBAQuery = existingBAQuery.eq('business_id', businessId);
    }
    const { data: existingBA } = await existingBAQuery.maybeSingle();

    if (existingBA) {
      await sb.from('business_assessments').update(baRow).eq('id', existingBA.id);
    } else {
      await sb.from('business_assessments').insert({ ...baRow, created_at: new Date().toISOString() });
    }

    // ── 7. Update gap_analyses (legacy — keep in sync) ────────────────────────
    const gapTypeMap = {
      profit_gap: 'Profit Gap',
      value_gap: 'Value Gap',
      recast_ebitda: 'Value Gap',
      tax_gap: 'Tax Gap',
      operations_gap: 'Operations Gap',
      freedom_assessment: 'Freedom Gap',
      cash_flow_gap: 'Cash Flow Gap',
      protections_gap: 'Protections Gap',
      wealth_gap: 'Wealth Gap',
    };
    const gapType = gapTypeMap[assessmentType];
    if (gapType) {
      const gapRow = {
        profile_id: profileId,
        gap_type: gapType,
        score: score ?? 0,
        opportunity_value: oppValue || null,
        severity: severity(oppValue),
        summary: baRow.summary,
        updated_at: new Date().toISOString(),
      };
      const { data: existingGap } = await sb.from('gap_analyses').select('id').eq('profile_id', profileId).eq('gap_type', gapType).maybeSingle();
      if (existingGap) {
        await sb.from('gap_analyses').update(gapRow).eq('id', existingGap.id);
      } else {
        await sb.from('gap_analyses').insert({ ...gapRow, created_at: new Date().toISOString() });
      }
    }

    // ── 7b. Persist industry to business_entities when profit_gap is saved ───
    if (assessmentType === 'profit_gap' && businessId) {
      const industry = state?.industry || answers?.industry_input;
      if (industry) {
        const { error: bizIndErr } = await sb.from('business_entities')
          .update({ industry, updated_at: new Date().toISOString() })
          .eq('id', businessId);
        if (bizIndErr) console.error('[saveAssessment] business_entities.industry update error:', bizIndErr.message);
        else console.log('[saveAssessment] business_entities.industry updated to:', industry);
      }
    }

    // ── 8. Update profile_financials ──────────────────────────────────────────
    // CRITICAL: Use ?? not || — zero is a valid value, must not become null.
    const financials = {
      profile_id: profileId,
      annual_revenue: state?.p1_rev ?? null,
      current_profit_margin: state?.p1_mymargin ?? null,
      estimated_ebitda: state?.v2_ebitda ?? null,
      updated_at: new Date().toISOString(),
    };
    if (assessmentType === 'tax_gap') {
      financials.agi = answers?.t3_agi ?? state?.t3_agi ?? null;
      financials.tax_gap_estimate = results?.t3_annual_gap ?? null;
    }
    if (assessmentType === 'profit_gap') {
      financials.profit_gap = oppValue;
    }
    if (assessmentType === 'value_gap') {
      financials.value_gap = oppValue;
      financials.estimated_enterprise_value = fmt(results?.current_value) ?? null;
      financials.potential_enterprise_value = fmt(results?.potential_value) ?? null;
    }
    if (assessmentType === 'recast_ebitda') {
      financials.normalized_ebitda = fmt(results?.recast_ebitda) ?? null;
      financials.total_add_backs = fmt(results?.total_addbacks) ?? null;
    }
    const { data: existingFin } = await sb.from('profile_financials').select('id').eq('profile_id', profileId).maybeSingle();
    if (existingFin) {
      await sb.from('profile_financials').update(financials).eq('id', existingFin.id);
    } else {
      await sb.from('profile_financials').insert(financials);
    }

    // ── 9. Update dashboard_metrics — write NUMERIC to gap columns, JSONB to *_details ──
    // Always include both profile_id AND business_id so reads scoped to either column work.
    // Schema cleanup: numeric gap columns get scalar amounts only; detail objects go to *_details JSONB columns.

    const dmPatch = {
      profile_id: profileId,
      ...(businessId ? { business_id: businessId } : {}),
      updated_at: new Date().toISOString(),
    };

    // Helper: severity from dollar gap
    function sev(dollarGap) {
      if (!dollarGap) return 'small';
      if (dollarGap > 500_000) return 'significant';
      if (dollarGap > 100_000) return 'moderate';
      return 'small';
    }

    // Write NUMERIC amount to gap column + JSONB detail to *_details column
    if (assessmentType === 'profit_gap') {
      const industryFromProfitGap = state?.industry || answers?.industry_input;
      if (industryFromProfitGap) {
        dmPatch.industry = industryFromProfitGap;
      }
      const gapToBest = fmt(oppValue);
      // Phase 6B.1 — p1_avg is a NET PROFIT benchmark. Only compare a verified
      // net-profit margin against it; otherwise write no gap at all rather than
      // a misleading one. (Also clamped to >= 0: a gap is room left to improve,
      // never a negative quantity.)
      const pgMarginType = state?.p1_mymargin_type || (state?.margin_semantics === 'ebitda_margin' ? 'ebitda_margin' : 'net_profit_margin');
      const pgProvenance = state?.p1_mymargin_provenance
        || (state?.margin_semantics === 'ebitda_margin' ? 'derived_from_ebitda' : 'verified');
      const pgComparable =
        pgMarginType === 'net_profit_margin' &&
        pgProvenance !== 'ambiguous_legacy' &&
        pgProvenance !== 'derived_from_ebitda' &&
        pgProvenance !== 'estimated_from_net_profit';

      const gapToAvg = pgComparable && state?.p1_rev && state.p1_avg != null && state.p1_mymargin != null 
        ? fmt(Math.max(0, state.p1_rev * ((state.p1_avg - state.p1_mymargin) / 100))) 
        : null;
      
      // Numeric column: primary dollar gap amount
      dmPatch.profit_gap = gapToBest;
      // JSONB detail column: full analysis object
      dmPatch.profit_gap_details = {
        score:          score != null ? Math.round(score) : null,
        gap_to_average: gapToAvg,
        gap_to_best:    gapToBest,
        severity:       sev(gapToBest),
        summary:        baRow.owner_friendly_explanation || null,
      };
    }

    if (assessmentType === 'value_gap') {
      const currentVal = fmt(results?.currentValue ?? results?.current_value);
      const potentialVal = fmt(results?.potentialValue ?? results?.potential_value);
      const gapAmount = fmt(results?.valueGap ?? results?.value_gap ?? oppValue);
      
      dmPatch.enterprise_value = currentVal;
      // Numeric column: primary dollar gap
      dmPatch.value_gap = gapAmount;
      // JSONB detail
      dmPatch.value_gap_details = {
        current_value:   currentVal,
        potential_value: potentialVal,
        gap_amount:      gapAmount,
        severity:        sev(gapAmount),
        summary:         baRow.owner_friendly_explanation || null,
      };
    }

    if (assessmentType === 'recast_ebitda') {
      const recastEbitda = fmt(results?.recast_ebitda);
      const addBacks = fmt(results?.total_addbacks);
      const valIncrease = fmt(results?.recast_value_impact);
      
      dmPatch.recast_ebitda = recastEbitda;
      dmPatch.recast_ebitda_gap_details = {
        add_backs:          addBacks,
        valuation_increase: valIncrease,
      };
    }

    if (assessmentType === 'tax_gap') {
      const annualOverpayment = fmt(results?.t3_annual_gap ?? oppValue);
      
      // Numeric column: annual dollar overpayment
      dmPatch.tax_gap = annualOverpayment;
      // JSONB detail
      dmPatch.tax_gap_details = {
        score:              score != null ? Math.round(score) : null,
        annual_overpayment: annualOverpayment,
        ten_year_cost:      annualOverpayment != null ? fmt(annualOverpayment * 10) : null,
        opportunities:      results?.t3_strategies || [],
        severity:           sev(annualOverpayment),
        summary:            baRow.owner_friendly_explanation || null,
      };
    }

    if (assessmentType === 'operations_gap') {
      const opsScore = score != null ? Math.round(score) : null;

      // Use the canonical values from the results object (set by calcOperationsScore via calculateValueOfTimeFreed)
      // NEVER invent a formula here — always read from the passed-in results.
      const hourlyValue = results?.hourly_value ?? null;
      const monthlyValueFreed = results?.monthly_value_freed ?? null;
      const freedHoursPerWeek = results?.freed_hours_per_week ?? null;
      const monthlyTakeHome = answers?.o4_takehome ?? state?.o4_takehome ?? null;
      const hoursWorkedPerWeek = answers?.o4_hrs ?? state?.o4_hrs ?? null;

      // Numeric column: score only (operations gap is score-based, not dollar-based)
      dmPatch.operations_gap = opsScore;
      // JSONB detail — standardized field names, no fake calculations
      dmPatch.operations_gap_details = {
        score:                       opsScore,
        // Canonical field names (standardized)
        hourly_value_of_time_freed:  hourlyValue,
        monthly_value_of_time_freed: monthlyValueFreed,
        hours_freed_per_week:        freedHoursPerWeek,
        monthly_take_home:           fmt(monthlyTakeHome),
        hours_worked_per_week:       hoursWorkedPerWeek,
        // Legacy aliases for backwards compatibility
        hourly_value_freed:          hourlyValue,
        monthly_value_freed:         monthlyValueFreed,
        severity:                    opsScore != null ? (opsScore < 45 ? 'significant' : opsScore < 75 ? 'moderate' : 'small') : 'small',
        summary:                     baRow.owner_friendly_explanation || null,
      };
    }

    if (assessmentType === 'freedom_assessment') {
      dmPatch.freedom_score = score;
      dmPatch.freedom_gap_details = {
        score:            score != null ? Math.round(score) : null,
        freedom_date:     results?.freedom_date || null,
        time_recoverable: results?.time_recoverable || null,
      };
    }

    if (assessmentType === 'cash_flow_gap') {
      const cashFlowOpp = fmt(oppValue);
      
      // Numeric column: dollar opportunity
      dmPatch.cash_flow_gap = cashFlowOpp;
      // JSONB detail
      dmPatch.cash_flow_gap_details = {
        score:                 score != null ? Math.round(score) : null,
        cash_flow_opportunity: cashFlowOpp,
        severity:              sev(cashFlowOpp),
        summary:               baRow.owner_friendly_explanation || null,
      };
    }

    if (assessmentType === 'protections_gap') {
      // Numeric column: score
      dmPatch.protections_gap = score != null ? Math.round(score) : null;
      // JSONB detail
      dmPatch.protections_gap_details = {
        score:                 score != null ? Math.round(score) : null,
        protection_risk_score: score != null ? Math.round(100 - score) : null,
        severity:              score != null ? (score < 45 ? 'significant' : score < 75 ? 'moderate' : 'small') : 'small',
        summary:               baRow.owner_friendly_explanation || null,
      };
    }

    if (assessmentType === 'wealth_gap') {
      // Numeric column: dollar gap
      dmPatch.wealth_gap = fmt(oppValue);
      // JSONB detail
      dmPatch.wealth_gap_details = {
        score:                  score != null ? Math.round(score) : null,
        wealth_readiness_score: score != null ? Math.round(score) : null,
        severity:               sev(oppValue),
        summary:                baRow.owner_friendly_explanation || null,
      };
    }

    // CIQ score — recalculate from available scores
    const scoreParts = [];
    if (assessmentType === 'profit_gap' && results?.profit_score != null) scoreParts.push(Math.round(results.profit_score));
    if (assessmentType === 'operations_gap' && score != null) scoreParts.push(Math.round(score));
    if (assessmentType === 'freedom_assessment' && score != null) scoreParts.push(Math.round(score));
    if (assessmentType === 'tax_gap' && oppValue != null) {
      const taxMaxRef = state?.t3_agi ? state.t3_agi * 0.1 : (oppValue * 2);
      if (taxMaxRef) scoreParts.push(Math.max(0, Math.round((1 - oppValue / taxMaxRef) * 100)));
    }
    if (scoreParts.length > 0) {
      dmPatch.ciq_score = Math.round(scoreParts.reduce((a, b) => a + b, 0) / scoreParts.length);
    }

    // Merge with existing row — never overwrite unrelated JSONB gap fields
    // Look up by business_id first (so generateOpportunities can find it), fallback to profile_id
    let existingDM = null;
    if (businessId) {
      const { data: dmByBiz } = await sb.from('dashboard_metrics').select('*').eq('business_id', businessId).maybeSingle();
      existingDM = dmByBiz;
    }
    if (!existingDM) {
      const { data: dmByProfile } = await sb.from('dashboard_metrics').select('*').eq('profile_id', profileId).maybeSingle();
      existingDM = dmByProfile;
    }
    const mergedPatch = { ...(existingDM || {}), ...dmPatch };

    if (existingDM) {
      const { error: dmUpdateErr } = await sb.from('dashboard_metrics').update(mergedPatch).eq('id', existingDM.id);
      if (dmUpdateErr) {
        console.error('[saveAssessment] dashboard_metrics update error:', dmUpdateErr.message);
        // Fallback: write only numeric gap columns + scalar fields (skip JSONB *_details temporarily)
        const fallbackPatch = { updated_at: mergedPatch.updated_at };
        if (mergedPatch.industry) fallbackPatch.industry = mergedPatch.industry;
        if (mergedPatch.ciq_score != null) fallbackPatch.ciq_score = mergedPatch.ciq_score;
        if (mergedPatch.recast_ebitda != null) fallbackPatch.recast_ebitda = mergedPatch.recast_ebitda;
        if (mergedPatch.enterprise_value != null) fallbackPatch.enterprise_value = mergedPatch.enterprise_value;
        if (mergedPatch.freedom_score != null) fallbackPatch.freedom_score = mergedPatch.freedom_score;
        // Numeric gap columns only
        if (mergedPatch.profit_gap != null) fallbackPatch.profit_gap = mergedPatch.profit_gap;
        if (mergedPatch.value_gap != null) fallbackPatch.value_gap = mergedPatch.value_gap;
        if (mergedPatch.tax_gap != null) fallbackPatch.tax_gap = mergedPatch.tax_gap;
        if (mergedPatch.operations_gap != null) fallbackPatch.operations_gap = mergedPatch.operations_gap;
        if (mergedPatch.cash_flow_gap != null) fallbackPatch.cash_flow_gap = mergedPatch.cash_flow_gap;
        if (mergedPatch.protections_gap != null) fallbackPatch.protections_gap = mergedPatch.protections_gap;
        if (mergedPatch.wealth_gap != null) fallbackPatch.wealth_gap = mergedPatch.wealth_gap;
        const { error: fbErr } = await sb.from('dashboard_metrics').update(fallbackPatch).eq('id', existingDM.id);
        if (fbErr) console.error('[saveAssessment] dashboard_metrics numeric fallback error:', fbErr.message);
        else console.log('[saveAssessment] dashboard_metrics numeric fallback succeeded, industry:', fallbackPatch.industry);
      } else {
        console.log('[saveAssessment] dashboard_metrics updated, gap field written:', assessmentType, '| ciq_score:', mergedPatch.ciq_score, '| business_id:', businessId);
      }
    } else {
      const { error: dmInsertErr } = await sb.from('dashboard_metrics').insert({ ...mergedPatch, created_at: new Date().toISOString() });
      if (dmInsertErr) console.error('[saveAssessment] dashboard_metrics insert error:', dmInsertErr.message);
      else console.log('[saveAssessment] dashboard_metrics inserted, gap field written:', assessmentType, '| business_id:', businessId);
    }

    // ── 10. Append business_metric_snapshots (rich V2 snapshot) ──────────────
    // Non-breaking: failures here must never affect dashboard_metrics behavior.
    try {
      // Fetch existing dashboard_metrics to merge with dmPatch
      const { data: existingDMForSnap } = await sb.from('dashboard_metrics').select('*').eq('profile_id', profileId).maybeSingle();
      const mergedDM = { ...(existingDMForSnap || {}), ...dmPatch };

      // Mark all previous snapshots for this profile as not latest
      if (businessId) {
        await sb.from('business_metric_snapshots')
          .update({ is_latest: false })
          .eq('business_id', businessId);
      } else {
        await sb.from('business_metric_snapshots')
          .update({ is_latest: false })
          .eq('profile_id', profileId);
      }

      // Build snapshot row with only fields that exist in the actual schema
      const snapshotRow = {
        profile_id:    profileId,
        business_id:   businessId || null,
        snapshot_date: new Date().toISOString().split('T')[0],
        snapshot_type: 'current',
        is_latest:     true,
        data_source:   'calculation_engine',
        metric_type:   assessmentType,
        metric_value:  oppValue ?? score ?? 0,
        source:        'assessment',
        notes:         `${assessmentType} completed`,
      };

      // Add CIQ score if calculated
      if (dmPatch.ciq_score != null) {
        snapshotRow.overall_impact_score = dmPatch.ciq_score;
      }

      // Remove business_id if null
      if (snapshotRow.business_id === null || snapshotRow.business_id === undefined) {
        delete snapshotRow.business_id;
      }

      await sb.from('business_metric_snapshots').insert(snapshotRow);

      // ── 10b. CIQ score snapshot — dedicated row so getMetricSnapshots (metric_type='ciq_score') works ──
      if (dmPatch.ciq_score != null) {
        const ciqSnapshot = {
          profile_id:    profileId,
          snapshot_date: new Date().toISOString().split('T')[0],
          snapshot_type: 'current',
          is_latest:     true,
          data_source:   'calculation_engine',
          metric_type:   'ciq_score',
          metric_value:  dmPatch.ciq_score,
          source:        'assessment',
          notes:         `IQ score after ${assessmentType}`,
        };
        if (businessId) ciqSnapshot.business_id = businessId;
        await sb.from('business_metric_snapshots').insert(ciqSnapshot);
      }

    } catch (snapErr) {
      // Non-fatal — log clearly but do not propagate
      console.error('[saveAssessmentToSupabase] snapshot write failed (non-fatal):', snapErr?.message || snapErr);
    }

    // ── 11. Upsert value_creation_events (V2 additive tracking) ─────────────
    // Non-breaking: any failure here is logged and silently ignored.
    // Duplicate prevention: keyed on (business_id, category, metadata->>'source_assessment_type').
    // source_assessment_type lives inside metadata JSONB — not a top-level column.
    // Column name is `category` (not event_category).
    try {
      const vcEvents = [];
      const now = new Date().toISOString();

      // Resolve assessmentId AFTER the business_assessments upsert (step 6) so first-run
      // completions correctly link to the newly created row.
      let assessmentId = existingBA?.id || null;
      if (!assessmentId) {
        const { data: newBA } = await sb.from('business_assessments')
          .select('id')
          .eq('profile_id', profileId)
          .eq('assessment_type', assessmentType)
          .maybeSingle();
        assessmentId = newBA?.id || null;
      }

      // Helper: build a base event object.
      // source_assessment_type is stored in metadata, not as a top-level column.
      function vcBase(category, title, estimatedImpact, recommendation) {
        const baseEvent = {
          profile_id: profileId,
          category,
          title,
          status: 'identified',
          // Column may be named 'estimated_value' or 'estimated_impact' depending on migration
          estimated_value: estimatedImpact || null,
          estimated_impact: estimatedImpact || null,
          description: recommendation || null,
          related_assessment_id: assessmentId,
          metadata: { source_assessment_type: assessmentType },
          updated_at: now,
        };
        return baseEvent;
      }

      if (assessmentType === 'profit_gap' && (oppValue || score != null)) {
        vcEvents.push(vcBase(
          'profit_improvement',
          'Profit Gap — opportunity to close margin to best-in-class',
          oppValue,
          baRow.recommendations?.[0] || null,
        ));
      }

      if (assessmentType === 'value_gap' && (oppValue || results?.current_value)) {
        vcEvents.push(vcBase(
          'value_growth',
          'Value Gap — potential increase in enterprise value',
          oppValue,
          baRow.recommendations?.[0] || null,
        ));
      }

      if (assessmentType === 'recast_ebitda' && results?.recast_value_impact) {
        vcEvents.push(vcBase(
          'value_growth',
          'Recast EBITDA — valuation increase from owner add-backs',
          fmt(results.recast_value_impact),
          'Document all legitimate add-backs with your CPA',
        ));
      }

      if (assessmentType === 'tax_gap' && oppValue) {
        vcEvents.push(vcBase(
          'tax_savings',
          'Tax Gap — estimated annual tax overpayment identified',
          oppValue,
          baRow.recommendations?.[0] || null,
        ));
      }

      if (assessmentType === 'operations_gap' && score != null) {
        const monthlyFreed = results?.monthly_value_freed ? fmt(results.monthly_value_freed) : null;
        vcEvents.push(vcBase(
          'operations_improvement',
          `Operations Gap — score ${score}/100, owner dependency reduction opportunity`,
          monthlyFreed,
          baRow.recommendations?.[0] || null,
        ));
      }

      if (assessmentType === 'freedom_assessment' && score != null) {
        vcEvents.push(vcBase(
          'wealth_progress',
          `Freedom Assessment — score ${score}/100, financial independence timeline identified`,
          null,
          baRow.recommendations?.[0] || null,
        ));
      }

      if (assessmentType === 'cash_flow_gap' && oppValue) {
        vcEvents.push(vcBase(
          'cash_flow_improvement',
          'Cash Flow Gap — opportunity to improve operating cash flow',
          oppValue,
          baRow.recommendations?.[0] || null,
        ));
      }

      if (assessmentType === 'protections_gap' && score != null) {
        vcEvents.push(vcBase(
          'protection_improvement',
          `Protections Gap — score ${score}/100, coverage gaps identified`,
          null,
          baRow.recommendations?.[0] || null,
        ));
      }

      if (assessmentType === 'wealth_gap' && oppValue) {
        vcEvents.push(vcBase(
          'wealth_progress',
          'Wealth Gap — gap to retirement/independence target identified',
          oppValue,
          baRow.recommendations?.[0] || null,
        ));
      }

      // Duplicate prevention — match on business_id (or profile_id fallback) + category +
      // metadata->>'source_assessment_type' stored in JSONB.
      for (const evt of vcEvents) {
        let query = sb
          .from('value_creation_events')
          .select('id')
          .eq('category', evt.category)
          .filter('metadata->>source_assessment_type', 'eq', assessmentType);

        // Prefer business_id from business_entities; fall back to profile_id when business_id is absent
        if (businessId) {
          query = query.eq('business_id', businessId);
        } else {
          query = query.eq('profile_id', profileId);
        }

        const { data: existing } = await query.maybeSingle();

        if (existing) {
          // Non-destructive update — never downgrade status or confidence_level.
          // CRITICAL: if already verified, do not touch status, confidence_level, or any verified_* fields.
          const { data: existingFull } = await sb
            .from('value_creation_events')
            .select('status')
            .eq('id', existing.id)
            .maybeSingle();
          const isVerified = existingFull?.status === 'verified';

          const vceUpdatePatch = {
            estimated_impact: evt.estimated_impact,
            title: evt.title,
            description: evt.description,
            metadata: evt.metadata,
            related_assessment_id: evt.related_assessment_id,
            updated_at: now,
          };
          if (!isVerified) {
            vceUpdatePatch.status = evt.status || existingFull?.status;
          }

          const { error: vceUpErr } = await sb.from('value_creation_events').update(vceUpdatePatch).eq('id', existing.id);
          if (vceUpErr) console.error('[saveAssessment] value_creation_events update error:', vceUpErr.message);
          else console.log('[saveAssessment] value_creation_events updated:', existing.id);
        } else {
          const insertEvent = { ...evt };
          if (insertEvent.business_id === null || insertEvent.business_id === undefined) {
            delete insertEvent.business_id;
          }
          const { error: vceInsErr } = await sb.from('value_creation_events').insert(insertEvent);
          if (vceInsErr) console.error('[saveAssessment] value_creation_events insert error:', vceInsErr.message);
          else console.log('[saveAssessment] value_creation_events inserted for category:', evt.category);
        }
      }

    } catch (vceErr) {
      // Non-fatal — log clearly but never break existing behavior
      console.error('[saveAssessmentToSupabase] value_creation_events write failed (non-fatal):', vceErr?.message || vceErr);
    }

    // ── 12. Upsert roadmap_items (non-destructive execution-tracking write) ────
    // Duplicate key: (business_id, source_assessment_type, title).
    // If a matching item exists: update estimated impacts, description, updated_at only.
    // If value_creation_events were written above, attempt to link them.
    // Any failure here is non-fatal and must never affect existing behavior.
    try {
      const now = new Date().toISOString();

      // Resolve assessmentId (may already be set from step 11, resolve again if not)
      let baId = existingBA?.id || null;
      if (!baId) {
        const { data: resolvedBA } = await sb.from('business_assessments')
          .select('id').eq('profile_id', profileId).eq('assessment_type', assessmentType).maybeSingle();
        baId = resolvedBA?.id || null;
      }

      // Fetch any value_creation_events written for this assessment so we can link them
      let vceByTitle = {};
      if (businessId || profileId) {
        let vceQuery = sb.from('value_creation_events')
          .select('id, title')
          .filter('metadata->>source_assessment_type', 'eq', assessmentType);
        if (businessId) { vceQuery = vceQuery.eq('business_id', businessId); }
        else             { vceQuery = vceQuery.eq('profile_id', profileId); }
        const { data: vceRows } = await vceQuery;
        for (const r of (vceRows || [])) { vceByTitle[r.title] = r.id; }
      }

      // Note: businessId is resolved from business_entities table (not 'businesses')

      // Helper: build a priority string from opportunity level
      function toPriority(oppLvl) {
        if (oppLvl === 'high')   return 'High';
        if (oppLvl === 'medium') return 'Medium';
        return 'Low';
      }

      // Helper: map assessment category to roadmap_items category
      const categoryMap = {
        profit_gap:         'Profit',
        value_gap:          'Value',
        recast_ebitda:      'Value',
        tax_gap:            'Tax',
        operations_gap:     'Operations',
        freedom_assessment: 'Freedom',
        cash_flow_gap:      'Cash Flow',
        protections_gap:    'Protection',
        wealth_gap:         'Wealth',
      };
      const itemCategory = categoryMap[assessmentType] || 'General';

      // Build one roadmap item per recommendation
      const recList = baRow.recommendations || [];
      const roadmapItems = recList.map((rec, idx) => {
        // Attempt to match a value_creation_event by partial title overlap
        const linkedVceId = Object.entries(vceByTitle).find(([t]) =>
          t.toLowerCase().includes(itemCategory.toLowerCase())
        )?.[1] || null;

        // Estimated impact fields — only populate for the primary (first) recommendation
        const isPrimary = idx === 0;
        return {
          title: rec,
          description: isPrimary ? baRow.owner_friendly_explanation : null,
          category: itemCategory,
          priority: toPriority(baRow.opportunity_level),
          impact_score: isPrimary && score != null ? Math.round(score) : null,
          source_assessment_type: assessmentType,
          source_assessment_id: baId,
          profile_id: profileId,
          business_id: businessId || null,
          status: 'Not Started',
          value_creation_event_id: linkedVceId,
          // Estimated financial impacts — only on primary recommendation, only when values exist
          estimated_value_created: isPrimary ? (oppValue || null) : null,
          estimated_tax_savings:   isPrimary && assessmentType === 'tax_gap'   ? oppValue : null,
          estimated_profit_improvement: isPrimary && assessmentType === 'profit_gap' ? oppValue : null,
          estimated_cash_flow_improvement: isPrimary && assessmentType === 'cash_flow_gap' ? oppValue : null,
          updated_at: now,
        };
      });

      for (const item of roadmapItems) {
        // Duplicate check: business_id (from business_entities) + source_assessment_type + title
        let dupQuery = sb.from('roadmap_items')
          .select('id')
          .eq('source_assessment_type', assessmentType)
          .eq('title', item.title);
        if (businessId) { dupQuery = dupQuery.eq('business_id', businessId); }
        else             { dupQuery = dupQuery.eq('profile_id', profileId); }

        const { data: existing } = await dupQuery.maybeSingle();

        if (existing) {
          // Non-destructive update — NEVER overwrite user-managed fields:
          // status, owner_name, due_date, completed_at, verified_at, implementation_notes
          const { error: riUpErr } = await sb.from('roadmap_items').update({
            description:                      item.description,
            estimated_value_created:          item.estimated_value_created,
            estimated_tax_savings:            item.estimated_tax_savings,
            estimated_profit_improvement:     item.estimated_profit_improvement,
            estimated_cash_flow_improvement:  item.estimated_cash_flow_improvement,
            impact_score:                     item.impact_score,
            value_creation_event_id:          item.value_creation_event_id,
            source_assessment_id:             item.source_assessment_id,
            updated_at:                       now,
          }).eq('id', existing.id);
          if (riUpErr) console.error('[saveAssessment] roadmap_items update error:', riUpErr.message);
          else console.log('[saveAssessment] roadmap_items updated:', existing.id);
        } else {
          const insertItem = { ...item };
          if (insertItem.business_id === null || insertItem.business_id === undefined) {
            delete insertItem.business_id;
          }
          const { error: riInsErr } = await sb.from('roadmap_items').insert(insertItem);
          if (riInsErr) console.error('[saveAssessment] roadmap_items insert error:', riInsErr.message);
          else console.log('[saveAssessment] roadmap_items inserted:', item.title);
        }
      }

    } catch (rmErr) {
      // Non-fatal — never break existing behavior
      console.error('[saveAssessmentToSupabase] roadmap_items write failed (non-fatal):', rmErr?.message || rmErr);
    }

    console.log('[saveAssessment] complete | assessmentType:', assessmentType, '| score:', score, '| oppValue:', oppValue, '| sessionId:', sessionId);

    // ── 13. Trigger CIQ aggregation layer ─────────────────────────────────────
    // Non-blocking: call regenerateCiqMetrics to recalculate dashboard_metrics + snapshots
    // This runs after all writes are complete, so it reads the latest data.
    try {
      const aggPayload = { businessId };
      const aggHeaders = {
        'Content-Type': 'application/json',
      };
      // Forward auth token if available (service role already has access)
      const authHeader = req.headers.get('Authorization');
      if (authHeader) aggHeaders['Authorization'] = authHeader;

      // Fire-and-forget: we don't await, just log the result
      fetch(new URL('/functions/regenerateCiqMetrics', req.url), {
        method: 'POST',
        headers: aggHeaders,
        body: JSON.stringify(aggPayload),
      }).then(async (resp) => {
        const aggResult = await resp.json().catch(() => ({}));
        console.log('[saveAssessment] CIQ aggregation triggered:', aggResult);
      }).catch((aggErr) => {
        console.error('[saveAssessment] CIQ aggregation failed (non-fatal):', aggErr?.message || aggErr);
      });
    } catch (aggErr) {
      console.error('[saveAssessment] CIQ aggregation trigger failed (non-fatal):', aggErr?.message || aggErr);
    }

    return Response.json({ success: true, sessionId, assessmentType, opportunityValue: oppValue, score });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});