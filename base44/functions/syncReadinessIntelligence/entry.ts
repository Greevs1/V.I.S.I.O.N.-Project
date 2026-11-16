/**
 * syncReadinessIntelligence
 * Generates personalized readiness items based on business data.
 * Returns array of suggested ReadinessItem objects (does NOT write — frontend merges).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BASELINE = [
  { title: 'Quality of Earnings (QoE) Report', category: 'financial', priority: 'critical', is_critical: true, recommended_by: 'demo_baseline', notes: 'Standard buyer requirement. Validates revenue quality and EBITDA add-backs.' },
  { title: 'Customer Concentration Analysis', category: 'financial', priority: 'high', recommended_by: 'demo_baseline', notes: 'Identify if any single customer exceeds 20% of revenue.' },
  { title: 'Tax Compliance Audit', category: 'financial', priority: 'high', recommended_by: 'demo_baseline', notes: 'Confirm all federal, state, and local tax filings are current.' },
  { title: 'Material Contracts Review', category: 'legal', priority: 'critical', is_critical: true, recommended_by: 'demo_baseline', notes: 'Review all contracts for change-of-control clauses.' },
  { title: 'Cap Table & Equity Review', category: 'legal', priority: 'critical', is_critical: true, recommended_by: 'demo_baseline', notes: 'Clean, fully-diluted cap table with no ambiguous equity grants.' },
  { title: 'IP & Trademark Assignment', category: 'legal', priority: 'high', recommended_by: 'demo_baseline', notes: 'All IP must be formally assigned to the entity, not personal ownership.' },
  { title: 'Key Employee Retention Agreements', category: 'hr', priority: 'high', recommended_by: 'demo_baseline', notes: 'Retention and non-compete agreements for top performers.' },
  { title: 'Management Succession Plan', category: 'hr', priority: 'high', recommended_by: 'demo_baseline', notes: 'Demonstrate business continuity beyond current owner.' },
  { title: 'SOP Documentation', category: 'operations', priority: 'medium', recommended_by: 'demo_baseline', notes: 'Written SOPs for all critical business processes.' },
  { title: 'Data Room Setup', category: 'operations', priority: 'high', recommended_by: 'demo_baseline', notes: 'Organized virtual data room ready for due diligence.' },
  { title: 'Insurance Review', category: 'operations', priority: 'medium', recommended_by: 'demo_baseline', notes: 'Review all business insurance policies for adequacy.' },
  { title: 'Financial Statements Review', category: 'financial', priority: 'critical', is_critical: true, recommended_by: 'demo_baseline', notes: 'Reviewed or audited financials for at least 3 years.' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!rawUrl || !serviceKey) return Response.json({ error: 'Missing Supabase config' }, { status: 500 });

    const supabaseUrl = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?).*$/, '').replace(/\/$/, '');
    const sb = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const { businessId } = body;

    // Fetch business data from Supabase in parallel
    const [assessmentsRes, metricsRes, docsRes, oppsRes, roadmapRes] = await Promise.all([
      sb.from('business_assessments').select('assessment_type, status, results').eq('business_id', businessId).limit(20),
      sb.from('dashboard_metrics').select('*').eq('business_id', businessId).maybeSingle(),
      sb.from('documents').select('document_type, name, status').eq('business_id', businessId).limit(50),
      sb.from('business_opportunities').select('title, category, priority, status').eq('business_id', businessId).limit(30),
      sb.from('roadmap_items').select('title, status, category').eq('business_id', businessId).limit(50),
    ]);

    const assessments = assessmentsRes.data || [];
    const metrics = metricsRes.data || {};
    const documents = docsRes.data || [];
    const opportunities = oppsRes.data || [];
    const roadmapItems = roadmapRes.data || [];

    // Build personalization rules
    const personalizedItems = [...BASELINE];
    const extraItems = [];

    const hasDocType = (type) => documents.some(d => d.document_type === type && d.status === 'completed');
    const hasAssessment = (type) => assessments.some(a => a.assessment_type === type && a.status === 'completed');
    const hasRoadmapTitle = (keyword) => roadmapItems.some(r => r.title?.toLowerCase().includes(keyword.toLowerCase()));

    // Tax gap personalization
    if (hasAssessment('tax_gap')) {
      const taxAssessment = assessments.find(a => a.assessment_type === 'tax_gap');
      const severity = taxAssessment?.results?.severity;
      const idx = personalizedItems.findIndex(i => i.title === 'Tax Compliance Audit');
      if (idx >= 0 && severity === 'significant') {
        personalizedItems[idx] = { ...personalizedItems[idx], priority: 'critical', is_critical: true, recommended_by: 'assessment', notes: `Tax Gap assessment found significant overpayment. Immediate tax strategy review required before exit.` };
      }
    }

    // P&L / Profit Gap personalization
    if (hasDocType('profit_loss') || hasAssessment('profit_gap')) {
      const idx = personalizedItems.findIndex(i => i.title === 'Quality of Earnings (QoE) Report');
      if (idx >= 0) {
        personalizedItems[idx] = { ...personalizedItems[idx], recommended_by: hasAssessment('profit_gap') ? 'assessment' : 'document', notes: 'P&L uploaded. QoE should reflect actual margin profile and recast add-backs.' };
      }
    } else {
      if (!hasRoadmapTitle('profit')) {
        extraItems.push({ title: 'Upload Profit & Loss Statements', category: 'financial', priority: 'high', recommended_by: 'missing_data', notes: 'P&L statements are required to complete Quality of Earnings analysis. Upload 3 years of financials.' });
      }
    }

    // Balance sheet
    if (!hasDocType('balance_sheet')) {
      extraItems.push({ title: 'Upload Balance Sheet', category: 'financial', priority: 'high', recommended_by: 'missing_data', notes: 'Balance sheet required to assess working capital, debt load, and asset quality.' });
    }

    // Tax returns
    if (hasDocType('tax_return')) {
      const idx = personalizedItems.findIndex(i => i.title === 'Tax Compliance Audit');
      if (idx >= 0) personalizedItems[idx] = { ...personalizedItems[idx], recommended_by: 'document', notes: 'Tax returns uploaded. Confirm all years match financial statements and no open liabilities.' };
    } else {
      extraItems.push({ title: 'Upload Tax Returns (3 years)', category: 'financial', priority: 'high', recommended_by: 'missing_data', notes: 'Federal tax returns are required for buyer due diligence.' });
    }

    // Payroll
    if (hasDocType('payroll_report')) {
      const idx = personalizedItems.findIndex(i => i.title === 'Key Employee Retention Agreements');
      if (idx >= 0) personalizedItems[idx] = { ...personalizedItems[idx], recommended_by: 'document', notes: 'Payroll data reviewed. Identify top 5 key employees and ensure retention agreements are in place.' };
    }

    // Value gap
    if (hasAssessment('value_gap') && metrics?.value_gap?.severity === 'significant') {
      extraItems.push({ title: 'Valuation Enhancement Plan', category: 'financial', priority: 'critical', is_critical: true, recommended_by: 'assessment', notes: `Value Gap assessment shows significant gap. Implement value-building initiatives before going to market.` });
    }

    // Operations gap
    if (hasAssessment('operations_gap') && metrics?.operations_gap?.severity === 'significant') {
      const idx = personalizedItems.findIndex(i => i.title === 'SOP Documentation');
      if (idx >= 0) personalizedItems[idx] = { ...personalizedItems[idx], priority: 'critical', is_critical: true, recommended_by: 'assessment', notes: 'Operations Gap is significant. SOP documentation is critical to demonstrate business runs without the owner.' };
    }

    // Freedom assessment
    if (hasAssessment('freedom_assessment')) {
      const idx = personalizedItems.findIndex(i => i.title === 'Management Succession Plan');
      if (idx >= 0) personalizedItems[idx] = { ...personalizedItems[idx], recommended_by: 'assessment', notes: 'Freedom Assessment completed. Succession plan should address owner dependency score.' };
    }

    // Opportunities → extra readiness items
    const criticalOpps = opportunities.filter(o => o.priority === 'critical' && o.status !== 'dismissed');
    for (const opp of criticalOpps.slice(0, 3)) {
      if (!hasRoadmapTitle(opp.title)) {
        extraItems.push({ title: `Address: ${opp.title}`, category: opp.category || 'operations', priority: 'high', recommended_by: 'opportunity', notes: `Linked from opportunity pipeline. Resolving this before exit will improve buyer confidence.` });
      }
    }

    const allItems = [...personalizedItems, ...extraItems];

    return Response.json({
      success: true,
      items: allItems,
      meta: {
        baseline_count: BASELINE.length,
        personalized_count: extraItems.length,
        data_sources: {
          assessments: assessments.length,
          documents: documents.length,
          opportunities: opportunities.length,
          roadmap_items: roadmapItems.length,
          has_metrics: !!metricsRes.data,
        }
      }
    });

  } catch (error) {
    console.error('[syncReadinessIntelligence] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});