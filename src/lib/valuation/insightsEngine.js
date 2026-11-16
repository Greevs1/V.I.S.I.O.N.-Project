/**
 * insightsEngine — Phase 13.3E.5
 *
 * Pure, deterministic engine that derives executive insights from approved
 * valuation calculations, verified intelligence, Build Value dimensions,
 * approved value drivers, confidence results, version intelligence, and
 * advisor-approved findings.
 *
 * No calculations. No fabrication. No I/O. When impact cannot be supported,
 * the engine returns "Impact not yet quantifiable" — never a fabricated number.
 *
 * Outputs:
 *   - currentValueSummary: EV, Equity, Defensible, Potential, Confidence, date, version
 *   - topDrivers: evidence-supported value enhancers
 *   - topDetractors: evidence-supported value suppressors
 *   - constraintSummary: largest constraints across EBITDA/multiple/transferability/confidence/evidence
 *   - fastestWins: candidate opportunities supported by current evidence
 *   - versionIntelligence: delta summary from version comparison
 */
import { buildValueAssessment } from './buildValueEngine';
import {
  getBlendedRecon, getEquityBridge, getOverallConfidence,
  getApprovedConclusion, fmtCurrency, fmtRange,
} from './valuationState';

// ── Impact label ──────────────────────────────────────────────────────────
export const IMPACT_NOT_QUANTIFIABLE = 'Impact not yet quantifiable';

// ── Current Value Summary ─────────────────────────────────────────────────
export function buildCurrentValueSummary({ calcSummary, summary, readiness }) {
  const recon = getBlendedRecon(calcSummary);
  const bridge = getEquityBridge(calcSummary);
  const confidence = getOverallConfidence(calcSummary);
  const conclusion = getApprovedConclusion(calcSummary);
  const conclusions = calcSummary?.conclusions || [];
  const potentialConclusion = conclusions.find((c) => c.conclusion_type === 'potential' && c.advisor_approved);

  const evLow = recon?.enterprise_value_low ?? null;
  const evMid = recon?.enterprise_value_mid ?? recon?.enterprise_value ?? null;
  const evHigh = recon?.enterprise_value_high ?? null;
  const eqLow = bridge?.equity_value_low ?? null;
  const eqMid = bridge?.equity_value_mid ?? bridge?.equity_value ?? null;
  const eqHigh = bridge?.equity_value_high ?? null;

  const defensible = conclusion?.defensible_value ?? null;
  const potential = potentialConclusion?.potential_value ?? null;

  // EV gap = potential - defensible (if both exist)
  const evGap = defensible != null && potential != null ? potential - defensible : null;

  const valuation = summary?.valuation;
  const versionCount = summary?.versionCount || 0;
  const latestVersion = summary?.latestVersion;

  return {
    hasApprovedValuation: !!recon && !!conclusion,
    enterprise_value: { low: evLow, mid: evMid, high: evHigh, range: fmtRange(evLow, evHigh) },
    equity_value: { low: eqLow, mid: eqMid, high: eqHigh, range: fmtRange(eqLow, eqHigh) },
    defensible_value: defensible,
    potential_value: potential,
    ev_gap: evGap,
    overall_confidence: confidence?.score ?? null,
    confidence_max: confidence?.max_score ?? 100,
    valuation_date: valuation?.valuation_date || null,
    current_version: versionCount > 0 ? `v${latestVersion?.version_number || versionCount}` : null,
    working_status: valuation?.status?.replace(/_/g, ' ') || 'draft',
    publication_ready: readiness?.ready || false,
  };
}

// ── Top Value Drivers ─────────────────────────────────────────────────────
// Derives evidence-supported value enhancers from:
//   1. Approved value drivers from the backend (getValueDrivers)
//   2. Build Value dimension strengths (high-confidence evidence)
//   3. Intelligence candidates with positive relevance
export function buildTopDrivers({ intelligence, calcSummary, valueDrivers, buildValue }) {
  const drivers = [];
  const safeValueDrivers = Array.isArray(valueDrivers) ? valueDrivers : [];

  // From approved value drivers (backend)
  const approvedDrivers = safeValueDrivers.filter(
    (d) => d.driver_type === 'enhancer' || d.is_positive !== false
  );
  approvedDrivers.forEach((d) => {
    drivers.push({
      source: 'value_driver',
      id: d.id,
      name: d.driver_name || d.name,
      category: d.category,
      current_state: d.current_state || d.description,
      why_it_matters: d.why_it_matters || d.rationale,
      ebitda_relevance: d.ebitda_relevance || '—',
      multiple_relevance: d.multiple_relevance || '—',
      transferability_relevance: d.transferability_relevance || '—',
      risk_relevance: 'Low',
      ev_impact_low: d.ev_impact_low ?? null,
      ev_impact_high: d.ev_impact_high ?? null,
      ev_impact_label: d.ev_impact_low != null && d.ev_impact_high != null
        ? `${fmtCurrency(d.ev_impact_low)} – ${fmtCurrency(d.ev_impact_high)}`
        : IMPACT_NOT_QUANTIFIABLE,
      confidence: d.confidence_score ?? d.confidence ?? null,
      evidence: d.evidence_summary || d.evidence || '—',
      advisor_status: d.advisor_status || (d.is_approved ? 'Approved' : 'Pending'),
      client_visible: d.client_visible ?? false,
      has_explainability: true,
    });
  });

  // From Build Value strengths (high-confidence evidence from dimensions)
  const bv = buildValue || buildValueAssessment(intelligence);
  if (bv?.scorecards) {
    bv.scorecards.forEach((sc) => {
      sc.strengths.forEach((st) => {
        if (st.confidence >= 70) {
          drivers.push({
            source: 'build_value',
            id: `bv_${sc.key}_${st.label}`,
            name: st.label,
            category: sc.label,
            current_state: st.value || 'Verified',
            why_it_matters: `${st.label} supports ${sc.label.toLowerCase()}, which influences ${sc.ebitda_relevance === 'Primary' ? 'EBITDA' : sc.multiple_relevance === 'Primary' ? 'valuation multiple' : 'transferability'}.`,
            ebitda_relevance: sc.ebitda_relevance,
            multiple_relevance: sc.multiple_relevance,
            transferability_relevance: sc.transferability_relevance,
            risk_relevance: 'Low',
            ev_impact_low: null,
            ev_impact_high: null,
            ev_impact_label: IMPACT_NOT_QUANTIFIABLE,
            confidence: st.confidence,
            evidence: st.source || 'Intelligence',
            advisor_status: 'Verified',
            client_visible: false,
            has_explainability: true,
            dimension_key: sc.key,
          });
        }
      });
    });
  }

  // Sort: approved first, then by confidence
  drivers.sort((a, b) => {
    if (a.advisor_status === 'Approved' && b.advisor_status !== 'Approved') return -1;
    if (b.advisor_status === 'Approved' && a.advisor_status !== 'Approved') return 1;
    return (b.confidence || 0) - (a.confidence || 0);
  });

  return drivers;
}

// ── Top Value Detractors ─────────────────────────────────────────────────
// Derives evidence-supported value suppressors from:
//   1. Approved value drivers with negative impact (detractors)
//   2. Build Value dimension risks
//   3. Intelligence conflicts and low-confidence items
//   4. Publication blockers
export function buildTopDetractors({ intelligence, calcSummary, readiness, valueDrivers, buildValue }) {
  const detractors = [];
  const safeValueDrivers = Array.isArray(valueDrivers) ? valueDrivers : [];

  // From approved detractors (backend value drivers with negative type)
  const approvedDetractors = safeValueDrivers.filter(
    (d) => d.driver_type === 'detractor' || d.is_positive === false
  );
  approvedDetractors.forEach((d) => {
    detractors.push({
      source: 'value_driver',
      id: d.id,
      name: d.driver_name || d.name,
      current_issue: d.current_state || d.description,
      why_it_matters: d.why_it_matters || d.rationale,
      ebitda_effect: d.ebitda_relevance || '—',
      multiple_effect: d.multiple_relevance || '—',
      risk_effect: d.risk_relevance || 'High',
      transferability_effect: d.transferability_relevance || '—',
      ev_impact_low: d.ev_impact_low ?? null,
      ev_impact_high: d.ev_impact_high ?? null,
      ev_impact_label: d.ev_impact_low != null && d.ev_impact_high != null
        ? `${fmtCurrency(d.ev_impact_low)} – ${fmtCurrency(d.ev_impact_high)}`
        : IMPACT_NOT_QUANTIFIABLE,
      confidence: d.confidence_score ?? d.confidence ?? null,
      evidence: d.evidence_summary || d.evidence || '—',
      missing_evidence: d.missing_evidence || null,
      recommended_validation: d.recommended_validation || 'Gather supporting evidence',
      advisor_status: d.advisor_status || (d.is_approved ? 'Approved' : 'Pending'),
      client_visible: d.client_visible ?? false,
    });
  });

  // From Build Value risks
  const bv = buildValue || buildValueAssessment(intelligence);
  if (bv?.scorecards) {
    bv.scorecards.forEach((sc) => {
      sc.risks.forEach((r) => {
        detractors.push({
          source: 'build_value',
          id: `bv_risk_${sc.key}_${r.label}`,
          name: r.label,
          current_issue: r.value || (r.conflicting ? 'Conflicting sources' : 'Risk identified'),
          why_it_matters: `${r.label} in ${sc.label.toLowerCase()} may suppress ${sc.ebitda_relevance === 'Primary' ? 'EBITDA' : sc.multiple_relevance === 'Primary' ? 'valuation multiple' : 'transferability'}.`,
          ebitda_effect: sc.ebitda_relevance,
          multiple_effect: sc.multiple_relevance,
          risk_effect: 'High',
          transferability_effect: sc.transferability_relevance,
          ev_impact_low: null,
          ev_impact_high: null,
          ev_impact_label: IMPACT_NOT_QUANTIFIABLE,
          confidence: r.confidence || 0,
          evidence: r.source || 'Intelligence',
          missing_evidence: sc.missing_evidence?.length ? sc.missing_evidence.join(', ') : null,
          recommended_validation: sc.recommended_next_step,
          advisor_status: r.conflicting ? 'Needs Review' : 'Identified',
          client_visible: false,
          dimension_key: sc.key,
        });
      });
    });
  }

  // From intelligence conflicts
  const conflicts = Array.isArray(intelligence?.conflicts) ? intelligence.conflicts : [];
  conflicts.forEach((c) => {
    detractors.push({
      source: 'conflict',
      id: `conflict_${c.field_key}`,
      name: c.field_display_name || c.field_key,
      current_issue: `Conflicting values: ${c.source_a_value} vs ${c.source_b_value}`,
      why_it_matters: c.recommended_action || 'Material conflict reduces confidence and may impact valuation.',
      ebitda_effect: '—',
      multiple_effect: 'High',
      risk_effect: 'High',
      transferability_effect: '—',
      ev_impact_low: null,
      ev_impact_high: null,
      ev_impact_label: IMPACT_NOT_QUANTIFIABLE,
      confidence: 0,
      evidence: `${c.source_a_name} vs ${c.source_b_name}`,
      missing_evidence: null,
      recommended_validation: 'Resolve conflict in Validate',
      advisor_status: 'Unresolved',
      client_visible: false,
      link_to_validate: true,
    });
  });

  // From publication blockers
  const blockers = Array.isArray(readiness?.critical_blockers) ? readiness.critical_blockers : [];
  blockers.forEach((b) => {
    detractors.push({
      source: 'blocker',
      id: `blocker_${b.key || b.message}`,
      name: 'Publication Blocker',
      current_issue: b.message,
      why_it_matters: b.detail || 'Blocks publication of the valuation.',
      ebitda_effect: '—',
      multiple_effect: '—',
      risk_effect: 'Critical',
      transferability_effect: '—',
      ev_impact_low: null,
      ev_impact_high: null,
      ev_impact_label: IMPACT_NOT_QUANTIFIABLE,
      confidence: 100,
      evidence: 'Publication readiness check',
      missing_evidence: null,
      recommended_validation: 'Resolve in Validate',
      advisor_status: 'Blocked',
      client_visible: false,
      link_to_validate: true,
    });
  });

  // Sort: blockers first, then by confidence
  detractors.sort((a, b) => {
    const order = { Blocked: 0, Unresolved: 1, 'Needs Review': 2, Identified: 3, Pending: 4, Approved: 5 };
    return (order[a.advisor_status] ?? 9) - (order[b.advisor_status] ?? 9);
  });

  return detractors;
}

// ── Constraint Summary ────────────────────────────────────────────────────
export function buildConstraintSummary({ intelligence, calcSummary, readiness, buildValue }) {
  const bv = buildValue || buildValueAssessment(intelligence);
  const bvSummary = bv?.summary;
  const confidence = getOverallConfidence(calcSummary);
  const blockers = Array.isArray(readiness?.critical_blockers) ? readiness.critical_blockers : [];

  return {
    largest_ebitda_constraint: bvSummary?.largest_ebitda_constraint || null,
    largest_multiple_constraint: bvSummary?.largest_multiple_constraint || null,
    largest_transferability_constraint: bvSummary?.largest_transferability_risk || null,
    largest_confidence_constraint: confidence && confidence.score < 70
      ? { label: 'Overall Confidence', value: `${confidence.score}/${confidence.max_score}`, detail: 'Below 70% threshold' }
      : null,
    largest_evidence_gap: bvSummary?.largest_evidence_gap || null,
    largest_publication_blocker: blockers[0] || null,
    highest_confidence_strength: bvSummary?.highest_confidence_strength || null,
    highest_confidence_risk: bv?.scorecards?.flatMap((s) => s.risks)?.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] || null,
  };
}

// ── Fastest Wins ──────────────────────────────────────────────────────────
// Candidate opportunities supported by current evidence. Not approved initiatives.
export function buildFastestWins({ intelligence, calcSummary, readiness }) {
  const wins = [];

  // From unresolved add-backs (approving them improves EBITDA)
  const addBacks = Array.isArray(intelligence?.addBackCandidates) ? intelligence.addBackCandidates : [];
  addBacks.filter((a) => a.advisor_approval_status !== 'approved').forEach((a) => {
    wins.push({
      id: `addback_${a.category}_${a.reporting_period || 'current'}`,
      name: `Resolve unsupported add-back: ${a.category}`,
      why_fast_win: a.description || 'Approving this add-back increases normalized EBITDA.',
      timeline: '1-2 weeks',
      difficulty: 'Low',
      required_evidence: a.supporting_document_required ? 'Supporting document' : 'Advisor review',
      ebitda_relevance: 'High',
      multiple_relevance: 'Moderate',
      confidence_improvement: 'High',
      ev_relevance: 'High',
      confidence: a.confidence_score || 60,
      dependencies: ['Advisor approval'],
      link_to_validate: true,
    });
  });

  // From conflicts (resolving improves confidence)
  const conflicts = Array.isArray(intelligence?.conflicts) ? intelligence.conflicts : [];
  conflicts.forEach((c) => {
    wins.push({
      id: `conflict_${c.field_key}`,
      name: `Resolve conflicting ${c.field_display_name || c.field_key}`,
      why_fast_win: 'Material conflict reduces confidence. Resolving it improves data quality.',
      timeline: '1 week',
      difficulty: 'Low',
      required_evidence: 'Source verification',
      ebitda_relevance: c.materiality > 15 ? 'High' : 'Moderate',
      multiple_relevance: 'Moderate',
      confidence_improvement: 'High',
      ev_relevance: 'Moderate',
      confidence: 80,
      dependencies: ['Source document review'],
      link_to_validate: true,
    });
  });

  // From missing high-impact evidence
  const candidates = Array.isArray(intelligence?.candidates) ? intelligence.candidates : [];
  const missing = candidates.filter((c) => c.status === 'missing' && c.materiality === 'high');
  missing.forEach((m) => {
    wins.push({
      id: `missing_${m.field_key}`,
      name: `Confirm ${m.display_name}`,
      why_fast_win: m.missing_guidance || 'Missing high-impact evidence. Confirming it improves valuation confidence.',
      timeline: '1-2 weeks',
      difficulty: 'Low',
      required_evidence: m.source_name || 'Client confirmation',
      ebitda_relevance: m.ebitda_relevance || 'Moderate',
      multiple_relevance: m.multiple_relevance || 'Moderate',
      confidence_improvement: 'High',
      ev_relevance: 'Moderate',
      confidence: 70,
      dependencies: ['Client or document request'],
      link_to_validate: true,
    });
  });

  // From publication blockers (resolving unblocks publication)
  const blockers = Array.isArray(readiness?.critical_blockers) ? readiness.critical_blockers : [];
  blockers.forEach((b) => {
    wins.push({
      id: `blocker_${b.key || b.message}`,
      name: `Resolve publication blocker: ${b.message}`,
      why_fast_win: b.detail || 'Unblocks publication of the valuation.',
      timeline: 'Immediate',
      difficulty: 'Medium',
      required_evidence: 'Varies',
      ebitda_relevance: '—',
      multiple_relevance: '—',
      confidence_improvement: 'High',
      ev_relevance: 'High',
      confidence: 100,
      dependencies: ['Advisor action'],
      link_to_validate: true,
    });
  });

  // Sort by difficulty (Low first), then timeline
  const difficultyOrder = { Low: 0, Medium: 1, High: 2 };
  wins.sort((a, b) => (difficultyOrder[a.difficulty] ?? 9) - (difficultyOrder[b.difficulty] ?? 9));

  return wins;
}

// ── Version Intelligence Summary ──────────────────────────────────────────
export function buildVersionIntelligence({ versionDeltas, currentValue }) {
  if (!Array.isArray(versionDeltas) || versionDeltas.length === 0) {
    return {
      has_multiple_versions: false,
      latest_delta: null,
      deltas: [],
    };
  }

  const deltas = versionDeltas.map((d) => ({
    version_from: d.version_from,
    version_to: d.version_to,
    ev_delta: d.enterprise_value_delta ?? null,
    equity_delta: d.equity_value_delta ?? null,
    ebitda_delta: d.ebitda_delta ?? null,
    multiple_delta: d.multiple_delta ?? null,
    confidence_delta: d.confidence_delta ?? null,
    defensible_delta: d.defensible_value_delta ?? null,
    potential_delta: d.potential_value_delta ?? null,
    value_attribution: d.value_attribution || null,
    waterfall: d.waterfall || null,
    advisor_story: d.advisor_valuation_story || null,
    client_story: d.client_safe_valuation_story || null,
  }));

  return {
    has_multiple_versions: true,
    latest_delta: deltas[0],
    deltas,
  };
}

// ── Main entry ────────────────────────────────────────────────────────────
export function buildExecutiveInsights({
  intelligence,
  calcSummary,
  readiness,
  summary,
  valueDrivers,
  versionDeltas,
}) {
  const buildValue = buildValueAssessment(intelligence);
  const currentValue = buildCurrentValueSummary({ calcSummary, summary, readiness });
  const topDrivers = buildTopDrivers({ intelligence, calcSummary, valueDrivers, buildValue });
  const topDetractors = buildTopDetractors({ intelligence, calcSummary, readiness, valueDrivers, buildValue });
  const constraintSummary = buildConstraintSummary({ intelligence, calcSummary, readiness, buildValue });
  const fastestWins = buildFastestWins({ intelligence, calcSummary, readiness });
  const versionIntelligence = buildVersionIntelligence({ versionDeltas, currentValue });

  // Recommended next action for insights
  const nextAction = deriveInsightsNextAction({ currentValue, topDetractors, fastestWins, readiness });

  return {
    currentValue,
    topDrivers,
    topDetractors,
    constraintSummary,
    fastestWins,
    versionIntelligence,
    buildValue,
    nextAction,
  };
}

function deriveInsightsNextAction({ currentValue, topDetractors, fastestWins, readiness }) {
  if (!currentValue.hasApprovedValuation) {
    return { label: 'Complete the Valuation stage to unlock approved value insights', link: 'valuation' };
  }
  const blockers = topDetractors.filter((d) => d.source === 'blocker');
  if (blockers.length > 0) {
    return { label: blockers[0].current_issue, link: 'validate' };
  }
  const conflicts = topDetractors.filter((d) => d.source === 'conflict');
  if (conflicts.length > 0) {
    return { label: `Resolve ${conflicts.length} material conflict${conflicts.length !== 1 ? 's' : ''}`, link: 'validate' };
  }
  if (fastestWins.length > 0) {
    return { label: `Review ${fastestWins.length} candidate fast win${fastestWins.length !== 1 ? 's' : ''}`, link: null };
  }
  return { label: 'Review the executive insights and proceed to Growth Plan', link: 'growth_plan' };
}