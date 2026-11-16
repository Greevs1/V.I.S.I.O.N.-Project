/**
 * Home Intelligence Check — determines whether a business has enough
 * persisted intelligence to qualify for Galileo Home (vs Magic Loop).
 *
 * This evaluates the Business Intelligence Contract, NOT entity counts.
 * A business qualifies for Home if meaningful persisted intelligence exists
 * — regardless of whether sprints or opportunities exist.
 *
 * Authentication alone is NOT enough.
 * Sprint existence is NOT required.
 * Opportunity existence is NOT required.
 */

/**
 * hasMeaningfulBusinessIntelligence — evaluates BIS contract completeness.
 *
 * @param {object|null} contract — the Business Intelligence Contract
 * @returns {boolean} — true if sufficient intelligence exists for Home
 */
export function hasMeaningfulBusinessIntelligence(contract) {
  if (!contract || !contract.business_id) return false;

  const hasIdentity = !!contract.business_identity?.name;
  if (!hasIdentity) return false;

  // ── Financial intelligence (must have actual values, not just records) ──
  const hasRevenue = contract.profitability?.revenue != null && contract.profitability?.revenue > 0;
  const hasEbitda = contract.profitability?.reported_ebitda != null && contract.profitability?.reported_ebitda > 0;
  const hasNetProfit = contract.profitability?.net_profit != null;
  const hasFinancials = hasRevenue || hasEbitda;

  // ── Assessment intelligence (completed assessments with results) ──
  const hasAssessments = (contract.assessment_completion_count || 0) > 0;

  // ── Valuation intelligence (actual value, not null) ──
  const hasValuation = contract.valuation?.current_value != null && contract.valuation?.current_value > 0;

  // ── Document intelligence (PROCESSED documents, not just uploaded) ──
  // A single empty/pending document should NOT qualify a business for Home.
  // Require at least one completed document OR verified extracted facts.
  const completedDocs = contract.document_readiness?.completed_documents || 0;
  const hasProcessedDocuments = completedDocs > 0;

  // ── Opportunity intelligence (real opportunities, not just records) ──
  const hasOpportunities = (contract.opportunities?.length || 0) > 0;

  // ── Derived intelligence (from assessments) ──
  const hasTaxGap = contract.tax?.annual_tax_gap != null;
  const hasOpsScore = contract.operations?.operations_score != null;
  const hasFreedomScore = contract.freedom?.freedom_score != null;

  // ── Decision: Home requires MEANINGFUL intelligence, not just record existence ──
  // A business qualifies if it has:
  //   - Financial data (revenue or EBITDA), OR
  //   - A completed assessment, OR
  //   - A valuation, OR
  //   - A processed document (not just uploaded), OR
  //   - Real opportunities, OR
  //   - Derived assessment results (tax gap, ops score, freedom score)
  //
  // A business does NOT qualify just because:
  //   - It has a name
  //   - It has an empty uploaded document
  //   - It has a profile
  return (
    hasFinancials ||
    hasAssessments ||
    hasValuation ||
    hasProcessedDocuments ||
    hasOpportunities ||
    hasTaxGap ||
    hasOpsScore ||
    hasFreedomScore
  );
}

/**
 * getIntelligenceSummary — returns a summary of what intelligence exists.
 * Used for debugging and the report.
 */
export function getIntelligenceSummary(contract) {
  if (!contract) return null;
  return {
    hasIdentity: !!contract.business_identity?.name,
    hasFinancials: contract.profitability?.revenue != null || contract.profitability?.reported_ebitda != null,
    hasAssessments: (contract.assessment_completion_count || 0) > 0,
    hasValuation: contract.valuation?.current_value != null,
    hasDocuments: (contract.document_readiness?.total_documents || 0) > 0,
    hasOpportunities: (contract.opportunities?.length || 0) > 0,
    assessmentCount: contract.assessment_completion_count || 0,
    documentCount: contract.document_readiness?.total_documents || 0,
    opportunityCount: contract.opportunities?.length || 0,
  };
}