/**
 * ConstraintSummary — Phase 13.3E.5
 *
 * Displays the largest constraints across EBITDA, multiple, transferability,
 * confidence, evidence, and publication. Every item links to the relevant
 * Build Value dimension, Valuation calculation, Validate issue, or Advanced
 * detail where applicable.
 */
import React from 'react';
import { TrendingDown, AlertTriangle, FileWarning, ShieldAlert, Eye, Award, AlertCircle, ArrowRight } from 'lucide-react';

function ConstraintItem({ icon: Icon, label, value, detail, color, onClick }) {
  return (
    <div
      className="rounded-lg p-3 flex items-start gap-3"
      style={{ background: `${color}08`, border: `1px solid ${color}20` }}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color }} />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xs font-medium text-foreground mt-0.5">{value}</p>
        {detail && <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p>}
      </div>
      {onClick && (
        <button onClick={onClick} className="shrink-0 text-muted-foreground hover:text-foreground">
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default function ConstraintSummary({ constraints, onNavigateToValidate, onNavigateToBuildValue }) {
  if (!constraints) return null;

  const {
    largest_ebitda_constraint,
    largest_multiple_constraint,
    largest_transferability_constraint,
    largest_confidence_constraint,
    largest_evidence_gap,
    largest_publication_blocker,
    highest_confidence_strength,
    highest_confidence_risk,
  } = constraints;

  const hasAny = largest_ebitda_constraint || largest_multiple_constraint || largest_transferability_constraint ||
    largest_confidence_constraint || largest_evidence_gap || largest_publication_blocker;

  if (!hasAny) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.15)' }}>
        <p className="text-xs text-muted-foreground">No material constraints identified. Evidence is sufficient across all dimensions.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {largest_ebitda_constraint && (
        <ConstraintItem
          icon={TrendingDown}
          label="Largest EBITDA Constraint"
          value={largest_ebitda_constraint.label}
          detail={`${largest_ebitda_constraint.count} missing EBITDA-relevance item${largest_ebitda_constraint.count !== 1 ? 's' : ''}`}
          color="#EF4444"
          onClick={() => onNavigateToBuildValue?.()}
        />
      )}
      {largest_multiple_constraint && (
        <ConstraintItem
          icon={TrendingDown}
          label="Largest Multiple Constraint"
          value={largest_multiple_constraint.label}
          detail={`${largest_multiple_constraint.count} missing multiple-relevance item${largest_multiple_constraint.count !== 1 ? 's' : ''}`}
          color="#F59E0B"
          onClick={() => onNavigateToBuildValue?.()}
        />
      )}
      {largest_transferability_constraint && (
        <ConstraintItem
          icon={AlertTriangle}
          label="Largest Transferability Constraint"
          value={largest_transferability_constraint.label}
          detail={`${largest_transferability_constraint.count} missing transferability-relevance item${largest_transferability_constraint.count !== 1 ? 's' : ''}`}
          color="#A855F7"
          onClick={() => onNavigateToBuildValue?.()}
        />
      )}
      {largest_confidence_constraint && (
        <ConstraintItem
          icon={ShieldAlert}
          label="Largest Confidence Constraint"
          value={largest_confidence_constraint.label}
          detail={largest_confidence_constraint.detail}
          color="#F59E0B"
        />
      )}
      {largest_evidence_gap && (
        <ConstraintItem
          icon={FileWarning}
          label="Largest Evidence Gap"
          value={largest_evidence_gap.label}
          detail={`${largest_evidence_gap.completeness}% complete`}
          color="#6B7280"
          onClick={() => onNavigateToBuildValue?.()}
        />
      )}
      {largest_publication_blocker && (
        <ConstraintItem
          icon={AlertCircle}
          label="Largest Publication Blocker"
          value={largest_publication_blocker.message}
          detail={largest_publication_blocker.detail || 'Blocks publication'}
          color="#EF4444"
          onClick={() => onNavigateToValidate?.()}
        />
      )}
      {highest_confidence_strength && (
        <ConstraintItem
          icon={Award}
          label="Highest-Confidence Strength"
          value={highest_confidence_strength.label}
          detail={`${highest_confidence_strength.confidence}% confidence · ${highest_confidence_strength.dimension || ''}`}
          color="#22c55e"
        />
      )}
      {highest_confidence_risk && (
        <ConstraintItem
          icon={Eye}
          label="Highest-Confidence Risk"
          value={highest_confidence_risk.label}
          detail={highest_confidence_risk.confidence ? `${highest_confidence_risk.confidence}% confidence` : 'Risk identified'}
          color="#EF4444"
        />
      )}
    </div>
  );
}