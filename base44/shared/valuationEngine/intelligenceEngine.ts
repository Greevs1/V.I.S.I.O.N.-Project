/**
 * intelligenceEngine.ts — Phase 13.3E.2
 *
 * Pure, deterministic engine that transforms loaded platform source data
 * into a unified valuation intelligence record.
 *
 * No I/O. The backend action loads source data and calls buildIntelligence().
 *
 * Outputs:
 *   - candidates: per-field unified records with provenance + confidence
 *   - conflicts: material disagreements between sources
 *   - addBackCandidates: proposed adjustments (advisor must approve)
 *   - documentIntelligence: per-category readiness
 *   - assessmentIntelligence: per-assessment reuse summary
 *   - questionnaireReduction: per-question auto-answer classification
 *   - summary: aggregate counts + completion %
 *   - recommendedAction: single highest-impact next action
 */

import {
  FIELD_REGISTRY,
  ADD_BACK_RULES,
  DOCUMENT_CATEGORIES,
  ASSESSMENT_DEFINITIONS,
  type IntelligenceContext,
  type ResolverResult,
  type FieldDef,
} from './intelligenceMapping.ts';

// ============================================================================
// CONFIDENCE LEVELS
// ============================================================================
export type ConfidenceLevel = 'verified' | 'high' | 'medium' | 'low' | 'missing' | 'conflicting';

export function confidenceLevel(score: number, verified = false, conflicting = false): ConfidenceLevel {
  if (conflicting) return 'conflicting';
  if (verified) return 'verified';
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  if (score >= 40) return 'low';
  return 'missing';
}

// ============================================================================
// CANDIDATE BUILD
// ============================================================================
export interface Candidate {
  field_key: string;
  display_name: string;
  category: string;
  suggested_value: any;
  formatted_value: string;
  answer_type: string;
  reporting_period?: string;
  source_type: string;
  source_id?: string;
  source_name: string;
  source_date?: string;
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  verification_status: string;
  conflict_status: 'none' | 'minor' | 'material';
  alternative_values: { source_name: string; value: any; confidence: number; reporting_period?: string }[];
  recommended_action: string;
  valuation_relevance?: string;
  questionnaire_key?: string;
  destination_table?: string;
  destination_record_id?: string;
  advisor_approved: boolean;
  client_confirmed: boolean;
  stale: boolean;
  last_updated?: string;
}

function formatValue(value: any, answerType: string): string {
  if (value == null || value === '') return '';
  if (answerType === 'currency') {
    const n = Number(value);
    if (!isNaN(n)) return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    return String(value);
  }
  if (answerType === 'percentage') {
    const n = Number(value);
    if (!isNaN(n)) return `${n}%`;
    return String(value);
  }
  if (answerType === 'boolean') return value === true || value === 'true' ? 'Yes' : 'No';
  return String(value);
}

function buildCandidate(def: FieldDef, ctx: IntelligenceContext): Candidate {
  // Run all resolvers, collect non-null results in priority order
  const results: ResolverResult[] = [];
  for (const resolve of def.resolvers) {
    const r = resolve(ctx);
    if (r) results.push(r);
  }

  // Check for existing advisor-approved valuation answer (lock)
  const existingAnswer = def.question_key
    ? findExistingAnswer(ctx, def.question_key)
    : null;
  const advisorApproved = existingAnswer?.source_type === 'advisor_entry' &&
    (existingAnswer?.advisor_verification_status === 'verified' || existingAnswer?.is_confirmed);

  // Detect conflicts among numeric candidates
  const numericResults = results.filter((r) => typeof r.value === 'number' && !isNaN(r.value));
  const conflicts = detectConflicts(numericResults, def.materiality_threshold || 0.1);
  const hasMaterialConflict = conflicts.length > 0;

  // Pick recommended source: advisor-approved first, else highest-priority (first) result
  let recommended: ResolverResult | null = null;
  if (advisorApproved && existingAnswer) {
    recommended = {
      value: existingAnswer.answer_value,
      source_type: 'advisor_entry',
      source_id: existingAnswer.id,
      source_name: 'Advisor Entry (approved)',
      source_date: existingAnswer.answered_at,
      confidence: 95,
    };
  } else if (results.length > 0) {
    recommended = results[0];
  }

  const confidenceScore = recommended?.confidence ?? 0;
  const level = confidenceLevel(confidenceScore, advisorApproved, hasMaterialConflict);

  // Stale check: if source_date older than 18 months
  const stale = recommended?.source_date ? isStale(recommended.source_date) : false;

  const alternatives = results.slice(1).map((r) => ({
    source_name: r.source_name,
    value: r.value,
    confidence: r.confidence,
    reporting_period: r.reporting_period,
  }));

  let recommendedAction = 'No action';
  if (!recommended) {
    recommendedAction = `Provide ${def.display_name} — best source: ${def.missing_guidance.best_source}`;
  } else if (hasMaterialConflict) {
    recommendedAction = `Resolve ${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} for ${def.display_name}`;
  } else if (advisorApproved) {
    recommendedAction = 'Advisor-approved — no action';
  } else if (level === 'medium' || level === 'low') {
    recommendedAction = `Verify ${def.display_name}`;
  } else {
    recommendedAction = 'Review for confirmation';
  }

  return {
    field_key: def.field_key,
    display_name: def.display_name,
    category: def.category,
    suggested_value: recommended?.value ?? null,
    formatted_value: formatValue(recommended?.value, def.answer_type),
    answer_type: def.answer_type,
    reporting_period: recommended?.reporting_period,
    source_type: recommended?.source_type ?? 'missing',
    source_id: recommended?.source_id,
    source_name: recommended?.source_name ?? 'No source',
    source_date: recommended?.source_date,
    confidence_score: confidenceScore,
    confidence_level: level,
    verification_status: advisorApproved ? 'verified' : recommended ? 'unverified' : 'missing',
    conflict_status: hasMaterialConflict ? 'material' : conflicts.length > 0 ? 'minor' : 'none',
    alternative_values: alternatives,
    recommended_action: recommendedAction,
    valuation_relevance: def.valuation_relevance,
    questionnaire_key: def.question_key,
    destination_table: def.question_key ? 'valuation_answers' : undefined,
    destination_record_id: existingAnswer?.id,
    advisor_approved: advisorApproved,
    client_confirmed: existingAnswer?.source_type === 'client_confirmation',
    stale,
    last_updated: recommended?.source_date,
  };
}

function findExistingAnswer(ctx: IntelligenceContext, questionKey: string) {
  const q = ctx.valuationQuestions.find((x) => x.question_key === questionKey);
  if (!q) return null;
  return ctx.valuationAnswers.find((x) => x.question_id === q.id) || null;
}

function isStale(dateStr: string): boolean {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
  return months > 18;
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================
export interface Conflict {
  field_key: string;
  field_name: string;
  source_a: string;
  source_b: string;
  value_a: any;
  value_b: any;
  absolute_difference: number;
  percentage_difference: number;
  reporting_period_a?: string;
  reporting_period_b?: string;
  confidence_a: number;
  confidence_b: number;
  recommended_source: string;
  materiality: 'material' | 'minor';
  recommended_action: string;
}

function detectConflicts(results: ResolverResult[], threshold: number): Conflict[] {
  if (results.length < 2) return [];
  const conflicts: Conflict[] = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i];
      const b = results[j];
      const diff = Math.abs(Number(a.value) - Number(b.value));
      const base = Math.max(Math.abs(Number(a.value)), Math.abs(Number(b.value)), 1);
      const pct = (diff / base) * 100;
      if (pct > threshold * 100) {
        const aMoreConfident = a.confidence >= b.confidence;
        conflicts.push({
          field_key: '',
          field_name: '',
          source_a: a.source_name,
          source_b: b.source_name,
          value_a: a.value,
          value_b: b.value,
          absolute_difference: diff,
          percentage_difference: Math.round(pct * 10) / 10,
          reporting_period_a: a.reporting_period,
          reporting_period_b: b.reporting_period,
          confidence_a: a.confidence,
          confidence_b: b.confidence,
          recommended_source: aMoreConfident ? a.source_name : b.source_name,
          materiality: 'material',
          recommended_action: `Confirm authoritative source (${aMoreConfident ? a.source_name : b.source_name})`,
        });
      }
    }
  }
  return conflicts;
}

// ============================================================================
// ADD-BACK CANDIDATE DETECTION
// ============================================================================
export interface AddBackCandidate {
  category: string;
  label: string;
  description: string;
  amount: number | null;
  period?: string;
  source: string;
  confidence: number;
  why_qualifies: string;
  buyer_defensibility_warning: string;
  replacement_cost_consideration: string;
  advisor_action: string;
}

function buildAddBackCandidates(ctx: IntelligenceContext): AddBackCandidate[] {
  const candidates: AddBackCandidate[] = [];
  const fields = ctx.extractedFields || [];
  for (const rule of ADD_BACK_RULES) {
    const matches = fields.filter((f) =>
      rule.match_fields.some((mf) => f.field_name?.toLowerCase().includes(mf.toLowerCase()))
    );
    if (matches.length === 0) continue;
    const best = matches.sort((a, b) => Number(b.confidence_score || 0) - Number(a.confidence_score || 0))[0];
    const amount = typeof best.normalized_value === 'number'
      ? best.normalized_value
      : parseFloat(String(best.field_value || '').replace(/[^0-9.\-]/g, ''));
    candidates.push({
      category: rule.category,
      label: rule.label,
      description: rule.description,
      amount: isNaN(amount) ? null : amount,
      period: best.metadata?.period || best.metadata?.fiscal_year,
      source: `Document: ${best.field_label || best.field_name}`,
      confidence: Math.min(70, Number(best.confidence_score || 50)),
      why_qualifies: rule.why_qualifies,
      buyer_defensibility_warning: rule.buyer_defensibility_warning,
      replacement_cost_consideration: rule.replacement_cost_consideration,
      advisor_action: 'Review and approve to include in normalized earnings',
    });
  }
  return candidates;
}

// ============================================================================
// DOCUMENT INTELLIGENCE
// ============================================================================
export interface DocumentCategoryIntelligence {
  key: string;
  label: string;
  present: boolean;
  count: number;
  processing: number;
  extraction_complete: number;
  needs_review: number;
  documents: { id: string; name: string; year?: number; status: string; confidence?: number; fields_extracted: number }[];
  fields_extracted: number;
  valuation_fields_populated: number;
  conflicts_generated: number;
  extraction_confidence: number;
  last_processed?: string;
}

function buildDocumentIntelligence(ctx: IntelligenceContext): DocumentCategoryIntelligence[] {
  const docs = ctx.documents || [];
  const extractedByDoc = {};
  for (const f of ctx.extractedFields || []) {
    if (!extractedByDoc[f.document_id]) extractedByDoc[f.document_id] = [];
    extractedByDoc[f.document_id].push(f);
  }

  return DOCUMENT_CATEGORIES.map((cat) => {
    const matched = docs.filter((d) => cat.doc_types.includes(d.document_type));
    const present = matched.length > 0;
    const processing = matched.filter((d) => ['uploading', 'processing', 'analyzing'].includes(d.status || d.upload_status || '')).length;
    const needsReview = matched.filter((d) => ['needs_review', 'pending'].includes(d.status || d.upload_status || '')).length;
    const extractionComplete = matched.filter((d) => ['completed', 'accepted', 'needs_review'].includes(d.status || d.upload_status || '')).length;

    let totalFields = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;
    let lastProcessed: string | undefined;
    for (const d of matched) {
      const fields = extractedByDoc[d.id] || [];
      totalFields += fields.length;
      for (const f of fields) {
        if (f.confidence_score) { totalConfidence += Number(f.confidence_score); confidenceCount++; }
      }
      const da = (ctx.documentAnalyses || []).find((a) => a.document_id === d.id);
      const processed = da?.updated_at || d.updated_at;
      if (processed && (!lastProcessed || processed > lastProcessed)) lastProcessed = processed;
    }

    return {
      key: cat.key,
      label: cat.label,
      present,
      count: matched.length,
      processing,
      extraction_complete: extractionComplete,
      needs_review: needsReview,
      documents: matched.map((d) => ({
        id: d.id,
        name: d.name,
        year: d.year,
        status: d.status || d.upload_status || 'unknown',
        confidence: (ctx.documentAnalyses || []).find((a) => a.document_id === d.id)?.confidence_score,
        fields_extracted: (extractedByDoc[d.id] || []).length,
      })),
      fields_extracted: totalFields,
      valuation_fields_populated: totalFields, // approx — fields extracted that map to valuation
      conflicts_generated: 0,
      extraction_confidence: confidenceCount > 0 ? Math.round(totalConfidence / confidenceCount) : 0,
      last_processed: lastProcessed,
    };
  });
}

// ============================================================================
// ASSESSMENT INTELLIGENCE
// ============================================================================
export interface AssessmentIntelligence {
  key: string;
  label: string;
  completion_status: string;
  date?: string;
  fields_reused: number;
  valuation_questions_answered: number;
  confidence: number;
  stale: boolean;
}

function buildAssessmentIntelligence(ctx: IntelligenceContext): AssessmentIntelligence[] {
  return ASSESSMENT_DEFINITIONS.map((def) => {
    const a = (ctx.assessments || []).find((x) => x.assessment_type === def.entity_type);
    const sb = (ctx.businessAssessments || []).find((x) => x.assessment_type === def.entity_type);
    const completed = a?.status === 'completed' || !!sb;
    const date = a?.completed_at || a?.updated_date || sb?.updated_at;
    const answers = a?.answers || sb?.answers || {};
    const fieldCount = Object.keys(answers).filter((k) => answers[k] != null && answers[k] !== '').length;
    // Count how many valuation questions this assessment could answer
    const valuationQuestionsAnswered = FIELD_REGISTRY.filter((f) => f.resolvers.some((r) => {
      // Crude check — resolvers that reference this assessment type
      return r.toString().includes(def.entity_type);
    })).length;
    return {
      key: def.key,
      label: def.label,
      completion_status: completed ? 'completed' : a ? 'in_progress' : 'not_started',
      date,
      fields_reused: fieldCount,
      valuation_questions_answered: completed ? valuationQuestionsAnswered : 0,
      confidence: completed ? 72 : 0,
      stale: date ? isStale(date) : false,
    };
  });
}

// ============================================================================
// QUESTIONNAIRE REDUCTION
// ============================================================================
export interface QuestionReduction {
  question_key: string;
  section: string;
  question_text: string;
  status: 'auto_verified' | 'auto_advisor_review' | 'auto_client_review' | 'conflicting' | 'missing' | 'advisor_judgment' | 'not_applicable';
  candidate_value?: any;
  confidence: number;
  hidden: boolean;
}

function buildQuestionnaireReduction(ctx: IntelligenceContext, candidates: Candidate[]): QuestionReduction[] {
  const candidateByQKey = {};
  for (const c of candidates) if (c.questionnaire_key) candidateByQKey[c.questionnaire_key] = c;

  return (ctx.valuationQuestions || []).map((q) => {
    const candidate = candidateByQKey[q.question_key];
    const existing = findExistingAnswer(ctx, q.question_key);
    let status: QuestionReduction['status'] = 'missing';
    let confidence = 0;
    let candidateValue: any = undefined;

    if (existing?.source_type === 'advisor_entry' && (existing.advisor_verification_status === 'verified' || existing.is_confirmed)) {
      status = 'auto_verified';
      confidence = 95;
      candidateValue = existing.answer_value;
    } else if (candidate?.conflict_status === 'material') {
      status = 'conflicting';
      confidence = candidate.confidence_score;
      candidateValue = candidate.suggested_value;
    } else if (candidate && candidate.confidence_level === 'high') {
      status = q.client_answerable ? 'auto_client_review' : 'auto_advisor_review';
      confidence = candidate.confidence_score;
      candidateValue = candidate.suggested_value;
    } else if (candidate && candidate.confidence_level === 'medium') {
      status = 'auto_advisor_review';
      confidence = candidate.confidence_score;
      candidateValue = candidate.suggested_value;
    } else if (q.advisor_only) {
      status = 'advisor_judgment';
    } else if (candidate && candidate.confidence_level === 'low') {
      status = 'advisor_judgment';
      confidence = candidate.confidence_score;
    } else {
      status = 'missing';
    }

    return {
      question_key: q.question_key,
      section: q.section,
      question_text: q.question_text,
      status,
      candidate_value: candidateValue,
      confidence,
      hidden: status === 'auto_verified',
    };
  });
}

// ============================================================================
// SUMMARY
// ============================================================================
export interface IntelligenceSummary {
  total_data_points: number;
  auto_populated: number;
  advisor_verified: number;
  client_confirmed: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  conflicting: number;
  missing: number;
  stale: number;
  documents_processed: number;
  assessments_reused: number;
  questions_auto_answered: number;
  completion_percentage: number;
}

function buildSummary(candidates: Candidate[], ctx: IntelligenceContext, reduction: QuestionReduction[]): IntelligenceSummary {
  const total = candidates.length;
  const autoPopulated = candidates.filter((c) => c.suggested_value != null && !c.advisor_approved).length;
  const advisorVerified = candidates.filter((c) => c.advisor_approved).length;
  const clientConfirmed = candidates.filter((c) => c.client_confirmed).length;
  const high = candidates.filter((c) => c.confidence_level === 'high').length;
  const medium = candidates.filter((c) => c.confidence_level === 'medium').length;
  const low = candidates.filter((c) => c.confidence_level === 'low').length;
  const conflicting = candidates.filter((c) => c.conflict_status === 'material').length;
  const missing = candidates.filter((c) => c.suggested_value == null).length;
  const stale = candidates.filter((c) => c.stale).length;
  const docsProcessed = (ctx.documents || []).filter((d) => ['completed', 'needs_review', 'accepted'].includes(d.status || d.upload_status || '')).length;
  const assessmentsReused = (ctx.assessments || []).filter((a) => a.status === 'completed').length + (ctx.businessAssessments || []).length;
  const questionsAutoAnswered = reduction.filter((r) => r.status !== 'missing' && r.status !== 'advisor_judgment' && r.status !== 'not_applicable').length;
  const available = candidates.filter((c) => c.suggested_value != null).length;
  const completionPercentage = total > 0 ? Math.round((available / total) * 100) : 0;

  return {
    total_data_points: total,
    auto_populated: autoPopulated,
    advisor_verified: advisorVerified,
    client_confirmed: clientConfirmed,
    high_confidence: high,
    medium_confidence: medium,
    low_confidence: low,
    conflicting,
    missing,
    stale,
    documents_processed: docsProcessed,
    assessments_reused: assessmentsReused,
    questions_auto_answered: questionsAutoAnswered,
    completion_percentage: completionPercentage,
  };
}

// ============================================================================
// RECOMMENDED ACTION
// ============================================================================
export interface RecommendedAction {
  title: string;
  detail: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  action_type: string;
}

function buildRecommendedAction(candidates: Candidate[], conflicts: Conflict[], addBacks: AddBackCandidate[], summary: IntelligenceSummary): RecommendedAction {
  // Priority: conflicts > missing critical > add-backs > low confidence > stale
  const materialConflicts = conflicts.length;
  if (materialConflicts > 0) {
    return {
      title: `Review ${materialConflicts} high-impact conflict${materialConflicts !== 1 ? 's' : ''}`,
      detail: 'Material differences between sources must be resolved before the valuation can be published.',
      priority: 'critical',
      action_type: 'resolve_conflicts',
    };
  }
  const missingCritical = candidates.filter((c) => c.suggested_value == null && (c.valuation_relevance === 'enterprise_value' || c.valuation_relevance === 'profitability'));
  if (missingCritical.length > 0) {
    return {
      title: `Provide ${missingCritical[0].display_name}`,
      detail: missingCritical[0].recommended_action,
      priority: 'high',
      action_type: 'provide_missing',
    };
  }
  if (addBacks.length > 0) {
    return {
      title: `Review ${addBacks.length} proposed add-back${addBacks.length !== 1 ? 's' : ''}`,
      detail: 'Proposed adjustments require advisor approval before inclusion in normalized earnings.',
      priority: 'medium',
      action_type: 'review_addbacks',
    };
  }
  const lowConfidence = candidates.filter((c) => c.confidence_level === 'low' && c.suggested_value != null);
  if (lowConfidence.length > 0) {
    return {
      title: `Verify ${lowConfidence[0].display_name}`,
      detail: lowConfidence[0].recommended_action,
      priority: 'medium',
      action_type: 'verify_low_confidence',
    };
  }
  const stale = candidates.filter((c) => c.stale);
  if (stale.length > 0) {
    return {
      title: `Refresh stale data: ${stale[0].display_name}`,
      detail: 'Source data is older than 18 months and may not reflect current conditions.',
      priority: 'low',
      action_type: 'refresh_stale',
    };
  }
  return {
    title: 'Intelligence scan complete',
    detail: 'No critical actions remaining. Proceed to the Valuation workspace.',
    priority: 'low',
    action_type: 'proceed',
  };
}

// ============================================================================
// MAIN ENTRY
// ============================================================================
export interface IntelligenceResult {
  candidates: Candidate[];
  conflicts: Conflict[];
  addBackCandidates: AddBackCandidate[];
  documentIntelligence: DocumentCategoryIntelligence[];
  assessmentIntelligence: AssessmentIntelligence[];
  questionnaireReduction: QuestionReduction[];
  summary: IntelligenceSummary;
  recommendedAction: RecommendedAction;
  generatedAt: string;
}

export function buildIntelligence(ctx: IntelligenceContext): IntelligenceResult {
  const candidates = FIELD_REGISTRY.map((def) => buildCandidate(def, ctx));

  // Attach field_key/field_name to conflicts
  const conflicts: Conflict[] = [];
  for (const c of candidates) {
    if (c.conflict_status === 'material' && c.alternative_values.length > 0) {
      conflicts.push({
        field_key: c.field_key,
        field_name: c.display_name,
        source_a: c.source_name,
        source_b: c.alternative_values[0].source_name,
        value_a: c.suggested_value,
        value_b: c.alternative_values[0].value,
        absolute_difference: Math.abs(Number(c.suggested_value || 0) - Number(c.alternative_values[0].value || 0)),
        percentage_difference: 0,
        confidence_a: c.confidence_score,
        confidence_b: c.alternative_values[0].confidence,
        recommended_source: c.confidence_score >= c.alternative_values[0].confidence ? c.source_name : c.alternative_values[0].source_name,
        materiality: 'material',
        recommended_action: c.recommended_action,
      });
    }
  }

  const addBackCandidates = buildAddBackCandidates(ctx);
  const documentIntelligence = buildDocumentIntelligence(ctx);
  const assessmentIntelligence = buildAssessmentIntelligence(ctx);
  const questionnaireReduction = buildQuestionnaireReduction(ctx, candidates);
  const summary = buildSummary(candidates, ctx, questionnaireReduction);
  const recommendedAction = buildRecommendedAction(candidates, conflicts, addBackCandidates, summary);

  return {
    candidates,
    conflicts,
    addBackCandidates,
    documentIntelligence,
    assessmentIntelligence,
    questionnaireReduction,
    summary,
    recommendedAction,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// PREFILL DECISION
// ============================================================================
export interface PrefillDecision {
  question_key: string;
  should_prefill: boolean;
  reason: string;
  candidate_value?: any;
  confidence: number;
  needs_confirmation: boolean;
}

export function decidePrefill(candidate: Candidate, existingAnswer: any): PrefillDecision {
  // Never overwrite approved advisor values
  if (existingAnswer?.source_type === 'advisor_entry' && (existingAnswer.advisor_verification_status === 'verified' || existingAnswer.is_confirmed)) {
    return { question_key: candidate.questionnaire_key || '', should_prefill: false, reason: 'Advisor-approved value exists — lock respected', confidence: 95, needs_confirmation: false };
  }
  // Never prefill conflicting as authoritative
  if (candidate.conflict_status === 'material') {
    return { question_key: candidate.questionnaire_key || '', should_prefill: false, reason: 'Material conflict — route to Verification Queue', confidence: candidate.confidence_score, needs_confirmation: true };
  }
  // Never modify published versions (handled by caller — no published answer is editable)
  if (candidate.suggested_value == null) {
    return { question_key: candidate.questionnaire_key || '', should_prefill: false, reason: 'No candidate value available', confidence: 0, needs_confirmation: false };
  }
  if (candidate.confidence_level === 'high') {
    return { question_key: candidate.questionnaire_key || '', should_prefill: true, reason: 'High confidence — prefill with confirmation required', confidence: candidate.confidence_score, needs_confirmation: true };
  }
  if (candidate.confidence_level === 'medium') {
    return { question_key: candidate.questionnaire_key || '', should_prefill: false, reason: 'Medium confidence — suggest only, add to Verification Queue', confidence: candidate.confidence_score, needs_confirmation: true };
  }
  // Low / missing
  return { question_key: candidate.questionnaire_key || '', should_prefill: false, reason: 'Low confidence — show as possible evidence only', confidence: candidate.confidence_score, needs_confirmation: false };
}