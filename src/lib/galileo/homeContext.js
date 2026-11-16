/**
 * Home Context — the single normalized context object for Galileo Home.
 *
 * This is the ONE coherent business context that all Home resolvers receive.
 * It is built from:
 *   - The Business Intelligence Contract (authoritative intelligence)
 *   - Scoped entity queries (sprints, galileo_opportunities)
 *   - User UX state (goals, saved items)
 *
 * Resolvers (NBM, NOW, DomainFocus, Playbook) receive this context and
 * NEVER independently reconstruct the business.
 *
 * Architecture:
 *   DATA SOURCES → BIS Contract → HomeContext → Resolvers → Galileo Home UI
 */

import { buildSignalsFromBIS, computeHomeSignalStates } from '@/lib/galileo/homeSignals';
import { hasMeaningfulBusinessIntelligence } from '@/lib/galileo/homeIntelligenceCheck';

/**
 * buildHomeContext — constructs the unified HomeContext from all sources.
 *
 * @param {object} params — {
 *   contract,           — BIS contract (from useBusinessIntelligenceContract)
 *   sprints,            — NinetyDaySprint records scoped by business_id
 *   galileoOpportunities, — galileo_opportunities records scoped by business_id
 *   goals,              — localStorage goals
 *   savedItems,         — sessionStorage saved items
 *   lastVisitDate,      — localStorage last visit timestamp
 * }
 * @returns {object} — HomeContext
 */
export function buildHomeContext({
  contract = null,
  sprints = [],
  galileoOpportunities = [],
  goals = [],
  savedItems = [],
  lastVisitDate = null,
}) {
  // ── Business identity ────────────────────────────────────────────────
  const business = contract?.business_identity
    ? {
        id: contract.business_id,
        name: contract.business_identity.name,
        industry: contract.business_identity.industry,
        entityType: contract.business_identity.entity_type,
      }
    : null;

  // ── Intelligence (from BIS) ───────────────────────────────────────────
  const intelligence = {
    businessIq: contract?.business_iq ?? null,
    confidence: contract?.business_confidence ?? null,
    assessmentCount: contract?.assessment_completion_count ?? 0,
    assessmentTotal: contract?.assessment_total_count ?? 0,
    documentReadiness: contract?.document_readiness ?? null,
  };

  // ── Financials (from BIS) ────────────────────────────────────────────
  const financials = {
    revenue: contract?.profitability?.revenue ?? null,
    revenueSource: contract?.profitability?.revenue_source ?? null,
    ebitda: contract?.profitability?.reported_ebitda ?? null,
    ebitdaSource: contract?.profitability?.reported_ebitda_source ?? null,
    recastEbitda: contract?.profitability?.recast_ebitda ?? null,
    netProfit: contract?.profitability?.net_profit ?? null,
    profitGap: contract?.profitability?.profit_gap ?? null,
    profitScore: contract?.profitability?.profit_score ?? null,
  };

  // ── Valuation (from BIS) ─────────────────────────────────────────────
  const valuation = {
    currentValue: contract?.valuation?.current_value ?? null,
    currentValueSource: contract?.valuation?.current_value_source ?? null,
    potentialValue: contract?.valuation?.potential_value ?? null,
    valueGap: contract?.valuation?.value_gap ?? null,
    baselineValue: contract?.valuation?.baseline_value ?? null,
    baselineDate: contract?.valuation?.baseline_date ?? null,
    verifiedValueCreated: contract?.valuation?.verified_value_created ?? null,
  };

  // ── Tax (from BIS) ───────────────────────────────────────────────────
  const tax = {
    annualGap: contract?.tax?.annual_tax_gap ?? null,
    tenYearGap: contract?.tax?.ten_year_tax_gap ?? null,
  };

  // ── Operations (from BIS) ────────────────────────────────────────────
  const operations = {
    score: contract?.operations?.operations_score ?? null,
    hoursFreedPerWeek: contract?.operations?.hours_freed_per_week ?? null,
    monthlyValueFreed: contract?.operations?.monthly_value_of_time_freed ?? null,
  };

  // ── Freedom (from BIS) ───────────────────────────────────────────────
  const freedom = {
    score: contract?.freedom?.freedom_score ?? null,
  };

  // ── Signals (from BIS) ───────────────────────────────────────────────
  const signals = buildSignalsFromBIS(contract);

  // ── Evidence / Documents (from BIS) ──────────────────────────────────
  const evidence = {
    documents: contract?.recent_documents ?? [],
    documentReadiness: contract?.document_readiness ?? null,
  };

  // ── Opportunities ────────────────────────────────────────────────────
  // BIS opportunities (from business_opportunities table) are the certified set.
  // galileo_opportunities entity may have additional Galileo-specific items.
  const bisOpportunities = (contract?.opportunities || []).map(normalizeBisOpportunity);
  const galileoOpps = (galileoOpportunities || []).map(normalizeGalileoOpportunity);
  const opportunities = mergeOpportunities(bisOpportunities, galileoOpps);

  // ── Plays / Sprints ──────────────────────────────────────────────────
  const plays = (sprints || []).map((s) => ({
    id: s.id,
    title: s.path_title || s.business_name || '90-Day Sprint',
    goal: s.path_goal || null,
    summary: s.path_summary || null,
    status: s.status,
    progress: s.progress_percent || 0,
    selectedPath: s.selected_path || null,
    needsExpertReview: s.needs_expert_review || false,
    verificationStatus: s.verification_status || null,
    lastGalileoUpdate: s.last_galileo_update_at || null,
    updatedAt: s.updated_date || null,
  }));

  // ── Recent changes (from BIS recent_documents) ──────────────────────
  const recentChanges = detectRecentChanges(contract, lastVisitDate);

  // ── Model completeness (from BIS) ────────────────────────────────────
  const modelCompleteness = computeModelCompleteness(contract);

  // ── Has meaningful intelligence ─────────────────────────────────────
  const hasIntelligence = hasMeaningfulBusinessIntelligence(contract);

  // ── Has financials ───────────────────────────────────────────────────
  const hasFinancials = financials.revenue != null || financials.ebitda != null;

  return {
    business,
    intelligence,
    signals,
    financials,
    valuation,
    tax,
    operations,
    freedom,
    evidence,
    opportunities,
    plays,
    goals,
    savedItems,
    recentChanges,
    modelCompleteness,
    hasIntelligence,
    hasFinancials,
    contract,
  };
}

/**
 * detectRecentChanges — identifies real changes since the last visit.
 * Uses BIS recent_documents timestamps. Does NOT invent changes.
 */
function detectRecentChanges(contract, lastVisitDate) {
  if (!contract?.recent_documents || contract.recent_documents.length === 0) return [];

  const since = lastVisitDate ? new Date(lastVisitDate) : new Date(0);
  const changes = [];

  for (const doc of contract.recent_documents) {
    if (!doc.created_at) continue;
    const createdAt = new Date(doc.created_at);
    if (createdAt > since) {
      changes.push({
        id: `doc_${doc.id}`,
        type: 'new_document',
        title: `New document: ${doc.name || 'financial document'}`,
        subtitle: doc.document_type ? `${doc.document_type}${doc.year ? ` · ${doc.year}` : ''}` : null,
        timestamp: doc.created_at,
        documentId: doc.id,
        documentType: doc.document_type,
      });
    }
  }

  changes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return changes;
}

/**
 * computeModelCompleteness — estimates completeness from BIS fields.
 * 0-100 based on how many intelligence domains have data.
 */
function computeModelCompleteness(contract) {
  if (!contract) return 0;

  const domains = [
    contract.profitability?.revenue != null,
    contract.profitability?.reported_ebitda != null,
    contract.valuation?.current_value != null,
    contract.operations?.operations_score != null,
    contract.freedom?.freedom_score != null,
    contract.tax?.annual_tax_gap != null,
    (contract.assessment_completion_count || 0) > 0,
    (contract.document_readiness?.total_documents || 0) > 0,
  ];

  const filled = domains.filter(Boolean).length;
  return Math.round((filled / domains.length) * 100);
}

function normalizeBisOpportunity(opp) {
  return {
    id: opp.id,
    title: opp.title,
    category: opp.category,
    impact: opp.estimated_impact ?? null,
    priorityScore: opp.priority_score ?? null,
    confidenceScore: opp.confidence_score ?? null,
    status: opp.status || 'available',
    source: opp.source || 'assessment',
    origin: 'bis',
    // The full record, so a detail surface can show what was actually found
    // instead of the handful of fields the Home cards need.
    raw: opp,
  };
}

function normalizeGalileoOpportunity(opp) {
  return {
    id: opp.id,
    title: opp.title,
    category: opp.category,
    impact: opp.estimated_value_created ?? opp.impact_score ?? null,
    priorityScore: opp.strategic_opportunity_score ?? null,
    confidenceScore: opp.confidence_score ?? null,
    status: opp.status || 'available',
    source: opp.source || 'galileo',
    convertedToPath: opp.converted_to_path || false,
    pathId: opp.path_id || null,
    createdAt: opp.created_date || null,
    origin: 'galileo',
    raw: opp,
  };
}

function mergeOpportunities(bisOpps, galileoOpps) {
  // Deduplicate by title (BIS and Galileo may have the same opportunity)
  const seen = new Set();
  const merged = [];

  for (const opp of [...bisOpps, ...galileoOpps]) {
    const key = (opp.title || '').toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(opp);
    } else if (!key) {
      merged.push(opp);
    }
  }

  return merged;
}